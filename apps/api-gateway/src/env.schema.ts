import { z } from '@oneul-sai/config';

// SPEC-001 12절 "토큰": 시크릿은 `openssl rand -base64 32`로 만든다.
// "32자 이상"은 `aaaa...`도 통과하므로 base64 디코드 길이로 검사한다.
export const MIN_ACCESS_SECRET_BYTES = 32;

const LOCALHOST_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isValidOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().default(4000),
    MEMBER_SERVICE_URL: z.string().default('http://localhost:4001'),
    EVENT_SERVICE_URL: z.string().default('http://localhost:4002'),
    MATCHING_SERVICE_URL: z.string().default('http://localhost:4003'),
    NOTIFICATION_SERVICE_URL: z.string().default('http://localhost:4004'),
    PAYMENT_SERVICE_URL: z.string().default('http://localhost:4005'),
    JWT_ACCESS_SECRET: z
      .string()
      .refine(
        (value) =>
          Buffer.from(value, 'base64').length >= MIN_ACCESS_SECRET_BYTES,
        {
          message: `base64 디코드 길이가 ${MIN_ACCESS_SECRET_BYTES}바이트 이상이어야 한다 (openssl rand -base64 32)`,
        },
      ),
    INTERNAL_API_TOKEN: z.string().min(32),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000,http://localhost:3001')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      )
      .refine((origins) => origins.length > 0, {
        message: 'origin이 하나 이상 필요하다',
      })
      .refine((origins) => origins.every((origin) => origin !== '*'), {
        message: '`*`는 credentials: true와 함께 쓸 수 없다',
      })
      .refine((origins) => origins.every(isValidOrigin), {
        message: 'origin 형식(`https://host[:port]`)이어야 한다',
      }),
    RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().positive().default(10),
  })
  .superRefine((values, ctx) => {
    if (values.NODE_ENV !== 'production') {
      return;
    }
    for (const origin of values.CORS_ORIGINS) {
      if (origin.startsWith('http://') && !LOCALHOST_ORIGIN.test(origin)) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: `프로덕션에서는 http:// origin을 허용하지 않는다 (localhost 제외): ${origin}`,
        });
      }
    }
  });

export type GatewayEnv = z.infer<typeof envSchema>;
