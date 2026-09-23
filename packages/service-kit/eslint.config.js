import base from '@oneul-sai/eslint-config/base';

// 편입 기준(ADR-010, README): (1) DB · Prisma를 쓰지 않는다 (2) env를 읽지 않는다 — 값은 앱이 생성자 · 팩토리로 넘긴다.
export default [
  ...base,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/*', 'prisma', 'prisma/*'],
              message:
                'service-kit은 DB · Prisma를 쓰지 않는다 (ADR-010 편입 기준 1).',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'service-kit은 env를 읽지 않는다 — 값은 앱이 생성자 · 팩토리로 넘긴다 (ADR-010 편입 기준 2).',
        },
      ],
    },
  },
];
