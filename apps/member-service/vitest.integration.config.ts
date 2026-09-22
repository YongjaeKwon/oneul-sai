import { defineConfig } from 'vitest/config';

// 실제 Postgres(member_db) 위에서 도는 통합 테스트 (SPEC-001 13절).
// 사전 조건: `prisma migrate deploy` 적용 + `db:generate`. 각 테스트가 테이블을 비우므로 파일을 직렬로 돌린다.
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.integration.spec.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
