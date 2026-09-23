import { configDefaults, defineConfig } from 'vitest/config';

// 단위 테스트. 통합 테스트(*.integration.spec.ts)는 vitest.integration.config.ts로 따로 돈다.
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.integration.spec.ts'],
    passWithNoTests: true,
    // 단위 테스트는 .env 없이 돌아야 한다(CI · 새 clone). DB에 붙지 않으므로 형식만 맞는 가짜 값이다.
    env: {
      INTERNAL_API_TOKEN: 'unit-test-internal-token-0123456789abcdef',
    },
  },
});
