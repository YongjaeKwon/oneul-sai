import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_TYP,
  type ClientType,
  type MemberRole,
} from '@oneul-sai/contracts';
import { SignJWT } from 'jose';
import {
  REFRESH_FAMILIES_PER_MEMBER,
  REFRESH_FAMILY_MAX_AGE_DAYS,
  REFRESH_GRACE_SECONDS,
} from '../auth/auth.constants.js';
import type { Prisma, RefreshToken } from '../generated/prisma/client.js';
import type { RevokedReason } from '../generated/prisma/enums.js';

// SPEC-001 12절 "토큰" · 10절 refresh 처리 순서 (D5). 판정 흐름(login · refresh · logout)은 AuthService에 있고,
// 여기에는 JWT 서명과 RefreshToken 행을 다루는 원시 연산만 둔다. 트랜잭션은 호출자가 열고 `tx`를 넘긴다.

export type TokenTx = Pick<
  Prisma.TransactionClient,
  'refreshToken' | '$queryRaw'
>;

export interface TokenServiceOptions {
  /** `new Uint8Array(Buffer.from(JWT_ACCESS_SECRET, 'base64'))` — Gateway와 같은 키 바이트 */
  secret: Uint8Array;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  now?: () => Date;
}

export interface IssuedRefreshToken {
  /** 원문(base64url 43자). 응답 한 번 이후 어디에도 남지 않는다. */
  token: string;
  familyId: string;
}

export function decodeAccessSecret(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export class TokenService {
  private readonly now: () => Date;

  constructor(private readonly options: TokenServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  get accessTtlSeconds(): number {
    return this.options.accessTtlSeconds;
  }

  /** 클레임: sub(memberId), role, iss, aud, typ(헤더), iat, exp = iat + TTL. HS256 고정 (12절). */
  async signAccessToken(memberId: string, role: MemberRole): Promise<string> {
    const iat = Math.floor(this.now().getTime() / 1000);
    return new SignJWT({ role })
      .setProtectedHeader({ alg: JWT_ALGORITHM, typ: JWT_TYP })
      .setSubject(memberId)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + this.options.accessTtlSeconds)
      .sign(this.options.secret);
  }

  /** `SELECT ... FOR UPDATE`로 행을 잠근다 — 같은 토큰의 두 요청이 직렬화된다 (10절). 없으면 null. */
  async lockByToken(tx: TokenTx, token: string): Promise<RefreshToken | null> {
    const hash = hashRefreshToken(token);
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "RefreshToken" WHERE "tokenHash" = ${hash} FOR UPDATE`;
    const id = rows[0]?.id;
    if (id === undefined) return null;
    return tx.refreshToken.findUnique({ where: { id } });
  }

  /** 잠그지 않는 조회 — 비밀번호 변경의 현재 가족 판정, logout-all의 쿠키 소유 확인용. */
  findByToken(tx: TokenTx, token: string): Promise<RefreshToken | null> {
    return tx.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(token) },
    });
  }

  isWithinGrace(
    row: Pick<RefreshToken, 'rotatedAt'>,
    now = this.now(),
  ): boolean {
    return (
      row.rotatedAt !== null &&
      now.getTime() - row.rotatedAt.getTime() <= REFRESH_GRACE_SECONDS * 1000
    );
  }

  /** `expiresAt` 경과 또는 `familyStartedAt + 90일` 경과 — 상태값은 바꾸지 않는다 (6절). */
  isExpired(
    row: Pick<RefreshToken, 'expiresAt' | 'familyStartedAt'>,
    now = this.now(),
  ): boolean {
    const familyDeadline =
      row.familyStartedAt.getTime() +
      REFRESH_FAMILY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    return (
      row.expiresAt.getTime() < now.getTime() || familyDeadline < now.getTime()
    );
  }

  async familyHasActive(tx: TokenTx, familyId: string): Promise<boolean> {
    const active = await tx.refreshToken.findFirst({
      where: { familyId, status: 'ACTIVE' },
      select: { id: true },
    });
    return active !== null;
  }

  /** 로그인: 새 가족(familyId · familyStartedAt = now) + ACTIVE 행. */
  async issueFamily(
    tx: TokenTx,
    input: { memberId: string; client: ClientType },
  ): Promise<IssuedRefreshToken> {
    const now = this.now();
    const token = generateRefreshToken();
    const familyId = randomUUID();
    await tx.refreshToken.create({
      data: {
        memberId: input.memberId,
        familyId,
        familyStartedAt: now,
        client: input.client,
        tokenHash: hashRefreshToken(token),
        status: 'ACTIVE',
        expiresAt: this.expiresAt(now),
      },
    });
    return { token, familyId };
  }

  /** 회전: 현재 행 ROTATED · rotatedAt = now, 같은 familyId · familyStartedAt · client로 새 ACTIVE 행 (10절 8번). */
  async rotate(tx: TokenTx, row: RefreshToken): Promise<IssuedRefreshToken> {
    const now = this.now();
    const token = generateRefreshToken();
    await tx.refreshToken.update({
      where: { id: row.id },
      data: { status: 'ROTATED', rotatedAt: now },
    });
    await tx.refreshToken.create({
      data: {
        memberId: row.memberId,
        familyId: row.familyId,
        familyStartedAt: row.familyStartedAt,
        client: row.client,
        tokenHash: hashRefreshToken(token),
        status: 'ACTIVE',
        expiresAt: this.expiresAt(now),
      },
    });
    return { token, familyId: row.familyId };
  }

  /** 가족의 ACTIVE 전부 → REVOKED(reason). 바뀐 행 수. */
  async revokeFamily(
    tx: TokenTx,
    familyId: string,
    reason: RevokedReason,
  ): Promise<number> {
    const { count } = await tx.refreshToken.updateMany({
      where: { familyId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: this.now(), revokedReason: reason },
    });
    return count;
  }

  /** 회원의 ACTIVE 전부(예외 가족 제외) → REVOKED(reason). 폐기된 가족 수. */
  async revokeAllForMember(
    tx: TokenTx,
    memberId: string,
    reason: RevokedReason,
    options: { exceptFamilyIds?: readonly string[] } = {},
  ): Promise<{ families: number; tokens: number }> {
    const except = options.exceptFamilyIds ?? [];
    const where: Prisma.RefreshTokenWhereInput = {
      memberId,
      status: 'ACTIVE',
      ...(except.length > 0 ? { familyId: { notIn: [...except] } } : {}),
    };
    const families = await tx.refreshToken.findMany({
      where,
      select: { familyId: true },
      distinct: ['familyId'],
    });
    const { count } = await tx.refreshToken.updateMany({
      where,
      data: { status: 'REVOKED', revokedAt: this.now(), revokedReason: reason },
    });
    return { families: families.length, tokens: count };
  }

  /** 요청에 실린 같은 클라이언트의 유효(ACTIVE) 토큰이면 그 가족을 폐기한다 (로그인 RELOGIN, 7절). 폐기했으면 true. */
  async revokePresentedFamily(
    tx: TokenTx,
    token: string,
    client: ClientType,
    reason: RevokedReason,
  ): Promise<boolean> {
    const row = await this.lockByToken(tx, token);
    if (row === null || row.status !== 'ACTIVE' || row.client !== client) {
      return false;
    }
    await this.revokeFamily(tx, row.familyId, reason);
    return true;
  }

  /** ACTIVE 가족이 상한(10)을 넘으면 가장 오래된 가족부터 REVOKED(LIMIT). 폐기된 가족 수. */
  async enforceFamilyLimit(tx: TokenTx, memberId: string): Promise<number> {
    const families = await tx.refreshToken.groupBy({
      by: ['familyId'],
      where: { memberId, status: 'ACTIVE' },
      _min: { familyStartedAt: true },
    });
    const excess = families.length - REFRESH_FAMILIES_PER_MEMBER;
    if (excess <= 0) return 0;

    const oldest = [...families]
      .sort(
        (a, b) =>
          (a._min.familyStartedAt?.getTime() ?? 0) -
          (b._min.familyStartedAt?.getTime() ?? 0),
      )
      .slice(0, excess);
    for (const family of oldest) {
      await this.revokeFamily(tx, family.familyId, 'LIMIT');
    }
    return oldest.length;
  }

  private expiresAt(now: Date): Date {
    return new Date(now.getTime() + this.options.refreshTtlSeconds * 1000);
  }
}
