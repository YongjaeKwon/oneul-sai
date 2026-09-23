import { configDefaults, defineConfig } from 'vitest/config';

// 단위 테스트. 통합 테스트(*.integration.spec.ts)는 vitest.integration.config.ts로 따로 돈다.
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.integration.spec.ts'],
    passWithNoTests: true,
  },
});
