import { z } from '@oneul-sai/config';

// env.ts와 분리한 이유: 스키마만 import하면 dotenv · process.env 파싱이 일어나지 않는다(member-service와 같은 구조).
// TEST_DATABASE_URL은 여기에 두지 않는다 — 통합 테스트 globalSetup만 읽는다 (SPEC-002 9절, D13).

/** SPEC-002 10절 "event-service 내부 구조" · 15절 5번 PR */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4002),
  DATABASE_URL: z
    .string()
    .default('postgresql://oneul:oneul@localhost:5432/event_db'),
  /** Gateway ↔ 서비스 공유 비밀(x-internal-token). api-gateway와 같은 값 */
  INTERNAL_API_TOKEN: z.string().min(32),
});

export type Env = z.infer<typeof envSchema>;
