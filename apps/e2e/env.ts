import 'dotenv/config';

import { parseEnv, z } from '@oneul-sai/config';

/**
 * e2e 설정(SPEC-003 13절). 운영자 계정은 seed에 쓴 값과 같아야 한다 — CI는 CI 전용 더미, 로컬은 `.env`에 사람이 적는다.
 * `*_DATABASE_URL`은 Playwright가 서버를 직접 띄울 때(CI, 또는 로컬에서 그 서버가 떠 있지 않을 때)만 쓴다. 로컬은 떠 있는 dev 서버를 먼저 다시 쓴다.
 */
export const env = parseEnv(
  z.object({
    CI: z.stringbool().default(false),
    E2E_ADMIN_EMAIL: z.email(),
    E2E_ADMIN_PASSWORD: z.string().min(1),
    E2E_API_URL: z.url().default('http://localhost:4000'),
    E2E_WEB_URL: z.url().default('http://localhost:3000'),
    E2E_ADMIN_URL: z.url().default('http://localhost:3001'),
    E2E_MEMBER_DATABASE_URL: z
      .string()
      .default('postgresql://oneul:oneul@localhost:5432/member_db'),
    E2E_EVENT_DATABASE_URL: z
      .string()
      .default('postgresql://oneul:oneul@localhost:5432/event_db'),
  }),
);
