import { defineConfig, devices } from '@playwright/test';

import { env } from './env.js';

/** 서버 하나 — CI는 빌드한 앱을 `start`로 띄우고, 로컬은 이미 떠 있는 dev 서버를 다시 쓴다(SPEC-003 13절). */
function server(
  name: string,
  url: string,
  extraEnv: Record<string, string> = {},
) {
  return {
    command: `pnpm --filter ${name} start`,
    url,
    reuseExistingServer: !env.CI,
    timeout: 120_000,
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
    env: extraEnv,
  };
}

/**
 * 대표 흐름 두 개(참가자 신청 · 취소, 운영자 신청 목록 · 취소)만 끝에서 끝까지 본다. Chromium 하나, 순서대로(`workers: 1`).
 * 화면 비교(스냅샷)는 쓰지 않고 문구 · 역할 · 주소로 확인한다. 실패하면 trace를 남긴다(디버깅용).
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: env.CI,
  retries: 0,
  reporter: env.CI ? [['github'], ['list']] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    server('@oneul-sai/member-service', 'http://localhost:4001/health', {
      DATABASE_URL: env.E2E_MEMBER_DATABASE_URL,
    }),
    server('@oneul-sai/event-service', 'http://localhost:4002/health', {
      DATABASE_URL: env.E2E_EVENT_DATABASE_URL,
    }),
    server('@oneul-sai/api-gateway', 'http://localhost:4000/health'),
    server('@oneul-sai/web', env.E2E_WEB_URL),
    server('@oneul-sai/admin', `${env.E2E_ADMIN_URL}/login`),
  ],
});
