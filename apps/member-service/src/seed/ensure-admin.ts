import { hashPassword } from '../auth/password.js';
import type { PrismaClient } from '../generated/prisma/client.js';

// SPEC-001 9절 seed 분기. upsert가 아니다:
//   행 없음            → ADMIN 생성
//   있고 role = ADMIN  → resetPassword일 때만 한 트랜잭션에서 비밀번호 갱신 + 그 계정의 ACTIVE refresh 토큰 전부
//                        REVOKED(PASSWORD_CHANGED) + 실패 카운터 초기화 (교체의 흔한 이유가 유출 의심이라 세션을 끊는다),
//                        아니면 아무것도 하지 않는다
//   있고 role ≠ ADMIN  → 에러 (누군가 같은 이메일로 먼저 가입한 것. 사람이 확인한다)
// 탈퇴한 ADMIN은 이메일이 익명화돼 "행 없음"으로 보이므로 새 행을 만든다.

export interface EnsureAdminInput {
  email: string;
  name: string;
  password: string;
  resetPassword: boolean;
}

export interface EnsureAdminResult {
  action: 'created' | 'password_reset' | 'unchanged';
  memberId: string;
  /** password_reset에서 REVOKED(PASSWORD_CHANGED)로 바뀐 refresh 토큰 행 수. 그 밖에는 0 */
  revokedTokens: number;
}

export class SeedAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedAdminError';
  }
}

/** 가입 API와 같은 정규화: trim + 소문자 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function ensureAdmin(
  prisma: PrismaClient,
  input: EnsureAdminInput,
): Promise<EnsureAdminResult> {
  const email = normalizeEmail(input.email);
  const existing = await prisma.member.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (!existing) {
    const created = await prisma.member.create({
      data: {
        email,
        name: input.name.trim(),
        role: 'ADMIN',
        passwordHash: await hashPassword(input.password),
        privacyAgreedAt: new Date(),
      },
      select: { id: true },
    });
    return { action: 'created', memberId: created.id, revokedTokens: 0 };
  }

  if (existing.role !== 'ADMIN') {
    throw new SeedAdminError(
      `이 이메일은 이미 ${existing.role} 회원이 쓰고 있다. 사람이 확인한다 (memberId=${existing.id})`,
    );
  }

  if (!input.resetPassword) {
    return { action: 'unchanged', memberId: existing.id, revokedTokens: 0 };
  }

  const passwordHash = await hashPassword(input.password);
  const revokedTokens = await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: existing.id },
      data: { passwordHash, failedLoginCount: 0, lastFailedLoginAt: null },
    });
    const { count } = await tx.refreshToken.updateMany({
      where: { memberId: existing.id, status: 'ACTIVE' },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedReason: 'PASSWORD_CHANGED',
      },
    });
    return count;
  });

  return { action: 'password_reset', memberId: existing.id, revokedTokens };
}
