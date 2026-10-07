import base from '@oneul-sai/eslint-config/base';

// 편입 기준(ADR-010 · ADR-012, README): (1) DB · Prisma를 쓰지 않는다 (2) env를 읽지 않는다 — 값은 앱이 팩토리로 넘긴다.
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
                'kafka는 DB · Prisma를 쓰지 않는다 — outbox · 소비 판정은 각 서비스에 둔다 (ADR-010 편입 기준 1, ADR-012).',
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
            'kafka는 env를 읽지 않는다 — 브로커 · clientId는 앱이 createKafka로 넘긴다 (ADR-010 편입 기준 2, ADR-012).',
        },
      ],
    },
  },
];
