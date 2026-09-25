import { assertTestDatabaseUrl, resetTestDatabase } from './test-database.js';

// 테스트 DB 보호 단위 테스트 (SPEC-002 13절, D13)

describe('assertTestDatabaseUrl', () => {
  const base = 'postgresql://oneul:oneul@localhost:5432';

  it('passes event_test_db', () => {
    expect(() => assertTestDatabaseUrl(`${base}/event_test_db`)).not.toThrow();
  });

  it.each([
    ['event_db', `${base}/event_db`],
    ['member_db', `${base}/member_db`],
    ['no database name', `${base}/`],
    ['no path', base],
  ])('rejects %s', (_label, url) => {
    expect(() => assertTestDatabaseUrl(url)).toThrow(
      'TEST_DATABASE_URL은 이름이 _test_db로 끝나는 전용 DB여야 합니다',
    );
  });
});

describe('resetTestDatabase', () => {
  function fakePrisma(currentDatabase: string) {
    const prisma = {
      $queryRaw: vi.fn(async () => [{ name: currentDatabase }]),
      $executeRaw: vi.fn(async () => 0),
    };
    return {
      prisma,
      client: prisma as unknown as Parameters<typeof resetTestDatabase>[0],
    };
  }

  it('throws without TRUNCATE when connected to event_db', async () => {
    const { prisma, client } = fakePrisma('event_db');
    await expect(resetTestDatabase(client)).rejects.toThrow(/event_db/);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('truncates Application, Schedule and Meetup on event_test_db', async () => {
    const { prisma, client } = fakePrisma('event_test_db');
    await resetTestDatabase(client);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings] = prisma.$executeRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
    ];
    expect(strings.join('')).toBe(
      'TRUNCATE "Application", "Schedule", "Meetup"',
    );
  });
});
