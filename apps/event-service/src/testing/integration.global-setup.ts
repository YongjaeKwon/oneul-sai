// vitest globalSetup — test:integration 실행마다 한 번 (SPEC-002 9절 "테스트 전용 DB", D13).
// 테스트 DB URL의 원천은 여기 하나다. 워커는 inject('testDatabaseUrl')로만 받는다.
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { parseEnv, z } from '@oneul-sai/config';
import type { TestProject } from 'vitest/node';
import { assertTestDatabaseUrl } from './test-database.js';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

export default function setup(project: TestProject): void {
  const { TEST_DATABASE_URL } = parseEnv(
    z.object({
      TEST_DATABASE_URL: z
        .string()
        .default('postgresql://oneul:oneul@localhost:5432/event_test_db'),
    }),
  );
  // 이름 검사가 migrate보다 먼저다 — event_db 같은 개발 DB에는 아무것도 하지 않는다
  assertTestDatabaseUrl(TEST_DATABASE_URL);

  // 비파괴: 적용 안 된 마이그레이션만 적용한다. DB가 없으면 Prisma가 만든다.
  // prisma.config.ts의 dotenv는 이미 있는 DATABASE_URL을 덮지 않는다.
  execSync('pnpm exec prisma migrate deploy', {
    cwd: project.config.root,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });

  project.provide('testDatabaseUrl', TEST_DATABASE_URL);
}
