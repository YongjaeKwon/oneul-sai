// 테스트 전용 DB 보호 (SPEC-002 9절 "테스트 전용 DB", D13). 빌드에서 제외된다(tsconfig.build.json).
// 이 파일은 PrismaService(→ env.ts)를 런타임에 import하지 않는다 — 단위 테스트가 env 없이 돈다.
import type { PrismaClient } from '../generated/prisma/client.js';

const TEST_DATABASE_SUFFIX = '_test_db';

/** globalSetup이 migrate 전에 부른다. URL이 가리키는 DB 이름이 `_test_db`로 끝나야 한다. */
export function assertTestDatabaseUrl(url: string): void {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!name.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      'TEST_DATABASE_URL은 이름이 _test_db로 끝나는 전용 DB여야 합니다',
    );
  }
}

/** 각 통합 테스트 앞에서 부른다. 워커가 실제로 붙은 DB를 확인한 뒤에만 비운다 — 마지막 방어선. */
export async function resetTestDatabase(
  prisma: Pick<PrismaClient, '$queryRaw' | '$executeRaw'>,
): Promise<void> {
  const rows = await prisma.$queryRaw<
    { name: string }[]
  >`SELECT current_database() AS name`;
  const name = rows[0]?.name;
  if (name === undefined || !name.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `테스트 DB가 아닌 ${name ?? '(알 수 없음)'}에 연결되어 비우지 않습니다`,
    );
  }
  await prisma.$executeRaw`TRUNCATE "Application", "Schedule", "Meetup"`;
}
