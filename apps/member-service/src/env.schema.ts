import { z } from '@oneul-sai/config';

// env.ts와 분리한 이유: 스키마만 import하면 dotenv · process.env 파싱이 일어나지 않아
// 단위 테스트(CI의 test 잡은 인증 env가 없다)에서 안전하게 검증할 수 있다.

const base64Bytes = (value: string): number =>
  Buffer.from(value, 'base64').length;

/** SPEC-001 15절 3번 PR(member-service env) · 12절 토큰 · 9절 seed */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(4001),
    DATABASE_URL: z
      .string()
      .default('postgresql://oneul:oneul@localhost:5432/member_db'),

    // ---------- 인증 (SPEC-001) ----------
    // api-gateway와 같은 값. "32자 이상"이 아니라 base64 디코드 길이 ≥ 32바이트를 요구한다 (12절)
    JWT_ACCESS_SECRET: z.string().refine((v) => base64Bytes(v) >= 32, {
      message:
        'base64 디코드 길이가 32바이트 이상이어야 한다 (openssl rand -base64 32)',
    }),
    /** 액세스 토큰 수명(초) */
    JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
    /** 리프레시 토큰 수명(초) = 30일 */
    REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),
    /** 리프레시 쿠키 Secure 속성. 로컬 .env.example은 false, 프로덕션은 true */
    COOKIE_SECURE: z.stringbool().default(true),
    /** Gateway ↔ 서비스 공유 비밀(x-internal-token). api-gateway와 같은 값 */
    INTERNAL_API_TOKEN: z.string().min(32),
    /** onulsai_rt_admin 쿠키로 오는 refresh · logout의 Origin 헤더와 비교한다. origin 형태로 정규화 */
    ADMIN_ORIGIN: z
      .url()
      .default('http://localhost:3001')
      .transform((v) => new URL(v).origin),

    // ---------- seed 전용 (pnpm db:seed). 서비스 부팅에는 필요 없다 ----------
    SEED_ADMIN_EMAIL: z.email().optional(),
    SEED_ADMIN_NAME: z.string().trim().min(1).max(50).optional(),
    /** 비밀번호 파일 경로. 우선순위: 파일 > SEED_ADMIN_PASSWORD(로컬 전용) > stdin */
    SEED_ADMIN_PASSWORD_FILE: z.string().min(1).optional(),
    SEED_ADMIN_PASSWORD: z.string().optional(),
    /** true면 이미 있는 ADMIN의 비밀번호를 갱신한다 */
    SEED_ADMIN_RESET_PASSWORD: z.stringbool().default(false),
  })
  .refine((v) => !(v.NODE_ENV === 'production' && !v.COOKIE_SECURE), {
    path: ['COOKIE_SECURE'],
    message: 'NODE_ENV=production에서는 true여야 한다',
  })
  // admin 경계의 유일한 원천이 이 값과의 비교라 기본값(http://localhost:3001)이 프로덕션에 남으면 안 된다 (12절)
  .refine(
    (v) =>
      !(v.NODE_ENV === 'production' && !v.ADMIN_ORIGIN.startsWith('https://')),
    {
      path: ['ADMIN_ORIGIN'],
      message: 'NODE_ENV=production에서는 https:// origin이어야 한다',
    },
  );

export type Env = z.infer<typeof envSchema>;
