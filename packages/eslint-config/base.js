import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

/**
 * 모든 TypeScript 패키지/서비스가 공유하는 기본 Flat Config.
 * Next.js 앱은 이 설정 대신 공식 `eslint-config-next` preset을 사용한다.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'build/**',
      'coverage/**',
      'node_modules/**',
      'src/generated/**',
    ],
  },
  ...tseslint.configs.recommended,
  prettier,
);
