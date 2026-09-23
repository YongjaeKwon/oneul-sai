import { inject } from 'vitest';
import { resetTestDatabase } from './test-database.js';

// 테스트 DB 보호 — 실제 연결 확인 (SPEC-002 13절, D13).
// 워커의 DATABASE_URL이 개발 DB를 가리켜도(CI 잡 env는 member_db) 테스트가 쓰는 PrismaService는 테스트 DB에 붙는다.
vi.stubEnv('DATABASE_URL', 'postgresql://oneul:oneul@localhost:5432/event_db');
const { PrismaService } = await import('../prisma/prisma.service.js');
const { env } = await import('../env.js');

const testDatabaseUrl = inject('testDatabaseUrl');
const prisma = new PrismaService(testDatabaseUrl);

async function currentDatabase(): Promise<string | undefined> {
  const rows = await prisma.$queryRaw<
    { name: string }[]
  >`SELECT current_database() AS name`;
  return rows[0]?.name;
}

afterAll(async () => {
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});

describe('test database protection (integration)', () => {
  it('PrismaService uses the injected URL, not DATABASE_URL', async () => {
    expect(env.DATABASE_URL).toMatch(/\/event_db$/);
    const name = await currentDatabase();
    expect(name).toBe(new URL(testDatabaseUrl).pathname.slice(1));
    expect(name).toMatch(/_test_db$/);
  });

  it('resetTestDatabase empties Schedule and Meetup', async () => {
    await resetTestDatabase(prisma);
    await prisma.meetup.create({
      data: {
        title: '오늘사이 로테이션 소개팅',
        schedules: {
          create: {
            startsAt: new Date('2026-10-04T05:00:00Z'),
            endsAt: new Date('2026-10-04T07:00:00Z'),
            applyDeadlineAt: new Date('2026-10-03T15:00:00Z'),
            priceMale: 39_000,
            priceFemale: 29_000,
            capacityMale: 7,
            capacityFemale: 7,
            venueArea: '성수',
          },
        },
      },
    });

    await resetTestDatabase(prisma);

    expect(await prisma.schedule.count()).toBe(0);
    expect(await prisma.meetup.count()).toBe(0);
  });
});
