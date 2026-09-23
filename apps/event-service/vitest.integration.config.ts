import { defineConfig } from 'vitest/config';

// 테스트 전용 DB(event_test_db) 위에서 도는 통합 테스트 (SPEC-002 9절 · 13절, D13).
// globalSetup이 TEST_DATABASE_URL 이름 검사 → prisma migrate deploy → provide('testDatabaseUrl')를 한다.
// 이 파일은 URL을 따로 계산하지 않는다. 각 테스트가 테이블을 비우므로 파일을 직렬로 돌린다.
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.integration.spec.ts'],
    globalSetup: ['src/testing/integration.global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // 앱 부팅(env.ts)에 필요한 값. 테스트는 이 값으로 x-internal-token을 붙이므로 .env · CI 값과 무관하게 맞는다.
    env: {
      INTERNAL_API_TOKEN: 'integration-test-internal-token-0123456789',
    },
  },
});
