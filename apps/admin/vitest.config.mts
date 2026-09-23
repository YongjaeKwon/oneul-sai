import { defineConfig } from 'vitest/config';

// 화면 도우미(lib/) 단위 테스트. 운영자 PC 시간대와 무관하게 서울 시각으로 계산하는지 보려고 TZ=UTC로 돈다(SPEC-002 13절).
export default defineConfig({
  test: {
    globals: true,
    include: ['lib/**/*.spec.ts'],
    env: { TZ: 'UTC' },
  },
});
