import { z } from '@oneul-sai/config';

// env.ts와 분리한 이유: 스키마만 import하면 dotenv · process.env 파싱이 일어나지 않는다(member-service와 같은 구조).
// TEST_DATABASE_URL은 여기에 두지 않는다 — 통합 테스트 globalSetup만 읽는다 (SPEC-002 9절, D13).

const DEV_MEMBER_SERVICE_URL = 'http://localhost:4001';

/** SPEC-002 10절 "event-service 내부 구조" · 15절 5번 PR, SPEC-003 10절 · 15절 5b */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(4002),
    DATABASE_URL: z
      .string()
      .default('postgresql://oneul:oneul@localhost:5432/event_db'),
    /** Gateway ↔ 서비스 공유 비밀(x-internal-token). api-gateway와 같은 값 */
    INTERNAL_API_TOKEN: z.string().min(32),
    /**
     * 위임 호출 대상 member-service 주소(Gateway와 같은 이름, ADR-011). development · test는 로컬 기본값,
     * production은 기본값 없이 필수 — 빠뜨리면 부팅이 실패해 모든 신청이 조용히 503이 되는 일을 막는다(SPEC-003 10절).
     */
    MEMBER_SERVICE_URL: z.url({ protocol: /^https?$/ }).optional(),
  })
  .superRefine((values, ctx) => {
    if (
      values.NODE_ENV === 'production' &&
      values.MEMBER_SERVICE_URL === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['MEMBER_SERVICE_URL'],
        message: '프로덕션에서는 MEMBER_SERVICE_URL이 필요하다',
      });
    }
  })
  .transform((values) => ({
    ...values,
    MEMBER_SERVICE_URL: values.MEMBER_SERVICE_URL ?? DEV_MEMBER_SERVICE_URL,
  }));

export type Env = z.infer<typeof envSchema>;
