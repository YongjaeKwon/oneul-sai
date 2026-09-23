import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 화면 도우미(lib/) 단위 테스트. 서버(UTC)에서도 서울 시각으로 계산하는지 보려고 TZ=UTC로 돈다(SPEC-002 13절).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    globals: true,
    include: ['lib/**/*.spec.ts'],
    env: { TZ: 'UTC' },
  },
});
