import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { parseEnv, z } from '@oneul-sai/config';
import { verifyPassword } from '../auth/password.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { ensureAdmin, SeedAdminError } from './ensure-admin.js';

// 실제 member_db 위에서 돈다 (SPEC-001 13절 "seed" 행). 각 테스트 앞에서 테이블을 비운다.

const { DATABASE_URL } = parseEnv(
  z.object({
    DATABASE_URL: z
      .string()
      .default('postgresql://oneul:oneul@localhost:5432/member_db'),
  }),
);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const input = {
  email: '  Seed-Admin@Example.com ',
  name: ' 운영자 ',
  password: 'seed-admin-password',
  resetPassword: false,
};

async function truncate(): Promise<void> {
  await prisma.refreshToken.deleteMany();
  await prisma.member.deleteMany();
}

async function createToken(
  memberId: string,
  familyId: string,
  status: 'ACTIVE' | 'ROTATED',
): Promise<string> {
  const row = await prisma.refreshToken.create({
    data: {
      memberId,
      familyId,
      familyStartedAt: new Date(),
      client: 'ADMIN',
      tokenHash: `hash-${familyId}-${status}-${Math.random()}`,
      status,
      expiresAt: new Date(Date.now() + 60_000),
      rotatedAt: status === 'ROTATED' ? new Date() : null,
    },
    select: { id: true },
  });
  return row.id;
}

beforeEach(truncate);
afterAll(async () => {
  await truncate();
  await prisma.$disconnect();
});

describe('ensureAdmin (integration)', () => {
  it('creates an ADMIN with normalized email, no gender/birthYear/phone and privacyAgreedAt', async () => {
    const result = await ensureAdmin(prisma, input);

    expect(result.action).toBe('created');
    expect(result.revokedTokens).toBe(0);
    const row = await prisma.member.findUniqueOrThrow({
      where: { id: result.memberId },
    });
    expect(row).toMatchObject({
      email: 'seed-admin@example.com',
      name: '운영자',
      role: 'ADMIN',
      status: 'ACTIVE',
      gender: null,
      birthYear: null,
      phone: null,
      failedLoginCount: 0,
    });
    expect(row.privacyAgreedAt).toBeInstanceOf(Date);
    expect(row.passwordHash.startsWith('scrypt$N=131072,r=8,p=1$')).toBe(true);
    await expect(
      verifyPassword(input.password, row.passwordHash),
    ).resolves.toBe(true);
  });

  it('is idempotent: a second run changes nothing (1 row, same hash, sessions kept)', async () => {
    const first = await ensureAdmin(prisma, input);
    const tokenId = await createToken(first.memberId, 'family-a', 'ACTIVE');
    const before = await prisma.member.findUniqueOrThrow({
      where: { id: first.memberId },
    });

    const second = await ensureAdmin(prisma, {
      ...input,
      password: 'a-different-password',
    });

    expect(second).toEqual({
      action: 'unchanged',
      memberId: first.memberId,
      revokedTokens: 0,
    });
    expect(await prisma.member.count()).toBe(1);
    const after = await prisma.member.findUniqueOrThrow({
      where: { id: first.memberId },
    });
    expect(after.passwordHash).toBe(before.passwordHash);
    const token = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: tokenId },
    });
    expect(token.status).toBe('ACTIVE');
  });

  it('resetPassword=true replaces the password, revokes ACTIVE sessions and zeroes the failure counter in one go', async () => {
    const first = await ensureAdmin(prisma, input);
    const activeA = await createToken(first.memberId, 'family-a', 'ACTIVE');
    const activeB = await createToken(first.memberId, 'family-b', 'ACTIVE');
    const rotated = await createToken(first.memberId, 'family-a', 'ROTATED');
    await prisma.member.update({
      where: { id: first.memberId },
      data: { failedLoginCount: 3, lastFailedLoginAt: new Date() },
    });

    const reset = await ensureAdmin(prisma, {
      ...input,
      password: 'new-admin-password',
      resetPassword: true,
    });

    expect(reset).toEqual({
      action: 'password_reset',
      memberId: first.memberId,
      revokedTokens: 2,
    });
    expect(await prisma.member.count()).toBe(1);

    const row = await prisma.member.findUniqueOrThrow({
      where: { id: first.memberId },
    });
    expect(row.failedLoginCount).toBe(0);
    expect(row.lastFailedLoginAt).toBeNull();
    await expect(
      verifyPassword(input.password, row.passwordHash),
    ).resolves.toBe(false);
    await expect(
      verifyPassword('new-admin-password', row.passwordHash),
    ).resolves.toBe(true);

    for (const id of [activeA, activeB]) {
      const token = await prisma.refreshToken.findUniqueOrThrow({
        where: { id },
      });
      expect(token.status).toBe('REVOKED');
      expect(token.revokedReason).toBe('PASSWORD_CHANGED');
      expect(token.revokedAt).toBeInstanceOf(Date);
    }
    const untouched = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: rotated },
    });
    expect(untouched.status).toBe('ROTATED');
    expect(untouched.revokedReason).toBeNull();
  });

  it('fails when a MEMBER already uses the email and leaves that row untouched', async () => {
    const member = await prisma.member.create({
      data: {
        email: 'seed-admin@example.com',
        passwordHash: 'not-a-real-hash',
        name: '회원',
        gender: 'FEMALE',
        birthYear: 1995,
        phone: '01012345678',
        privacyAgreedAt: new Date(),
      },
    });

    await expect(ensureAdmin(prisma, input)).rejects.toBeInstanceOf(
      SeedAdminError,
    );

    const row = await prisma.member.findUniqueOrThrow({
      where: { id: member.id },
    });
    expect(row.role).toBe('MEMBER');
    expect(row.passwordHash).toBe('not-a-real-hash');
    expect(await prisma.member.count()).toBe(1);
  });
});
