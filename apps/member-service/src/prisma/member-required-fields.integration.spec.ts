import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { parseEnv, z } from '@oneul-sai/config';
import { PrismaClient } from '../generated/prisma/client.js';

// 마이그레이션 init_member에 손으로 넣은 CHECK 제약 "Member_required_fields" (SPEC-001 9절 · 13절).
// Prisma 스키마는 CHECK를 표현하지 못하므로 실제 DB로만 검증할 수 있다.

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

const base = {
  passwordHash: 'not-a-real-hash',
  privacyAgreedAt: new Date(),
};

async function truncate(): Promise<void> {
  await prisma.refreshToken.deleteMany();
  await prisma.member.deleteMany();
}

beforeEach(truncate);
afterAll(async () => {
  await truncate();
  await prisma.$disconnect();
});

describe('Member_required_fields CHECK (integration)', () => {
  it('rejects a MEMBER without phone', async () => {
    await expect(
      prisma.member.create({
        data: {
          ...base,
          email: 'no-phone@example.com',
          name: '회원',
          gender: 'MALE',
          birthYear: 1990,
          phone: null,
        },
      }),
    ).rejects.toThrow(/Member_required_fields/);
  });

  it('rejects an ACTIVE member without a name (ADMIN included)', async () => {
    await expect(
      prisma.member.create({
        data: { ...base, email: 'no-name@example.com', role: 'ADMIN' },
      }),
    ).rejects.toThrow(/Member_required_fields/);
  });

  it('accepts an ADMIN with a name only', async () => {
    await expect(
      prisma.member.create({
        data: {
          ...base,
          email: 'admin@example.com',
          name: '운영자',
          role: 'ADMIN',
        },
      }),
    ).resolves.toMatchObject({ role: 'ADMIN', phone: null });
  });

  it('accepts a WITHDRAWN row with every personal field null', async () => {
    await expect(
      prisma.member.create({
        data: {
          ...base,
          email: 'withdrawn+00000000-0000-0000-0000-000000000000@invalid',
          passwordHash: 'withdrawn',
          status: 'WITHDRAWN',
          withdrawnAt: new Date(),
        },
      }),
    ).resolves.toMatchObject({ status: 'WITHDRAWN', name: null });
  });
});
