import { API_ERROR_CODES, type ApiErrorResponse } from '@oneul-sai/contracts';
import { ensureAdmin } from '../seed/ensure-admin.js';
import {
  cookieNames,
  TEST_PASSWORD,
  TestApp,
  type ApiResult,
} from '../testing/integration-app.js';

// SPEC-001 13절 통합 "백오프": 검증 전 지연 · 계정 직렬화 · 15분 창 · 같은 카운터를 쓰는 네 경로 · ADMIN 동일.
// 지연 단위를 줄여 돌린다(LoginBackoffService.delayUnitMs). 규칙은 같다: 5번째 시도 1단위, 6번째 2단위, 7번째 4단위.

const UNIT_MS = 500;

let t: TestApp;

beforeAll(async () => {
  t = await TestApp.start();
  t.backoff.delayUnitMs = UNIT_MS;
});
beforeEach(() => t.truncate());
afterAll(async () => {
  await t.truncate();
  await t.close();
});

const codeOf = (result: ApiResult): string | undefined =>
  (result.body as ApiErrorResponse).code;

async function timed(
  run: () => Promise<ApiResult>,
): Promise<{ result: ApiResult; ms: number }> {
  const started = Date.now();
  const result = await run();
  return { result, ms: Date.now() - started };
}

async function counterOf(memberId: string): Promise<number> {
  const row = await t.prisma.member.findUniqueOrThrow({
    where: { id: memberId },
    select: { failedLoginCount: true },
  });
  return row.failedLoginCount;
}

describe('login backoff (integration)', () => {
  it('delays from the 5th attempt before verification, on success too, and resets after the window', async () => {
    const { input, profile } = await t.signup();
    const wrong = () => t.login(input.email, 'wrong-password', 'WEB');
    const right = () => t.login(input.email, input.password, 'WEB');

    for (let i = 0; i < 4; i += 1) {
      const result = await wrong();
      expect(result.status).toBe(401);
      expect(codeOf(result)).toBe(API_ERROR_CODES.INVALID_CREDENTIALS);
    }
    expect(await counterOf(profile.id)).toBe(4);

    const fifth = await timed(wrong);
    expect(fifth.result.status).toBe(401);
    expect(fifth.ms).toBeGreaterThanOrEqual(UNIT_MS);
    expect(await counterOf(profile.id)).toBe(5);

    // 맞는 비밀번호도 같은 시간(2단위)을 기다린 뒤 통과한다. 잠금(423)은 없다.
    const sixth = await timed(right);
    expect(sixth.result.status).toBe(200);
    expect(sixth.ms).toBeGreaterThanOrEqual(2 * UNIT_MS);
    expect(await counterOf(profile.id)).toBe(0);

    for (let i = 0; i < 5; i += 1) await wrong();
    expect(await counterOf(profile.id)).toBe(5);
    await t.prisma.member.update({
      where: { id: profile.id },
      data: { lastFailedLoginAt: new Date(Date.now() - 16 * 60 * 1000) },
    });
    // 창 밖: 지연 없음(창 안이었다면 2단위), 실패하면 카운터 1
    const afterWindow = await timed(wrong);
    expect(afterWindow.result.status).toBe(401);
    expect(afterWindow.ms).toBeLessThan(2 * UNIT_MS);
    expect(await counterOf(profile.id)).toBe(1);
  }, 60_000);

  it('serializes parallel guesses on one account: delays add up (1 + 2 + 4 units) and the counter is exact', async () => {
    const { input, profile } = await t.signup();
    for (let i = 0; i < 4; i += 1) {
      await t.login(input.email, 'wrong-password', 'WEB');
    }

    const started = Date.now();
    const results = await Promise.all([
      t.login(input.email, 'wrong-password', 'WEB'),
      t.login(input.email, 'wrong-password', 'WEB'),
      t.login(input.email, 'wrong-password', 'WEB'),
    ]);
    const elapsed = Date.now() - started;
    expect(results.map((result) => result.status)).toEqual([401, 401, 401]);
    expect(elapsed).toBeGreaterThanOrEqual(7 * UNIT_MS);
    expect(await counterOf(profile.id)).toBe(7);
  }, 60_000);

  it('withdraw, password change and phone change failures raise the same counter', async () => {
    const { input, profile } = await t.signup();
    const user = { id: profile.id, role: 'MEMBER' as const };

    const withdraw = await t.call({
      method: 'DELETE',
      path: '/api/v1/members/me',
      body: { password: 'wrong-password' },
      user,
    });
    expect(withdraw.status).toBe(401);
    expect(codeOf(withdraw)).toBe(API_ERROR_CODES.INVALID_CREDENTIALS);
    expect(await counterOf(profile.id)).toBe(1);

    const password = await t.call({
      method: 'POST',
      path: '/api/v1/auth/password',
      body: {
        currentPassword: 'wrong-password',
        newPassword: 'another-password',
      },
      user,
    });
    expect(password.status).toBe(401);
    expect(await counterOf(profile.id)).toBe(2);

    const phone = await t.call({
      method: 'PATCH',
      path: '/api/v1/members/me',
      body: { phone: '010-9999-8888', currentPassword: 'wrong-password' },
      user,
    });
    expect(phone.status).toBe(401);
    expect(await counterOf(profile.id)).toBe(3);

    const login = await t.login(input.email, input.password, 'WEB');
    expect(login.status).toBe(200);
    expect(await counterOf(profile.id)).toBe(0);
  }, 60_000);

  it('applies the same rule to ADMIN accounts (no lockout, no exception)', async () => {
    const admin = await ensureAdmin(t.prisma, {
      email: 'admin@example.com',
      name: '운영자',
      password: TEST_PASSWORD,
      resetPassword: false,
    });
    for (let i = 0; i < 4; i += 1) {
      const result = await t.login(
        'admin@example.com',
        'wrong-password',
        'ADMIN',
      );
      expect(result.status).toBe(401);
    }
    const fifth = await timed(() =>
      t.login('admin@example.com', TEST_PASSWORD, 'ADMIN'),
    );
    expect(fifth.result.status).toBe(200);
    expect(fifth.ms).toBeGreaterThanOrEqual(UNIT_MS);
    expect(fifth.result.cookies[cookieNames.ADMIN]).toBeDefined();
    expect(await counterOf(admin.memberId)).toBe(0);
  }, 60_000);

  it('answers an unknown email with the same code and message as a wrong password', async () => {
    const { input } = await t.signup();
    const unknown = await t.login('nobody@example.com', 'whatever-1', 'WEB');
    const wrong = await t.login(input.email, 'wrong-password', 'WEB');
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toMatchObject({
      code: API_ERROR_CODES.INVALID_CREDENTIALS,
      message: (wrong.body as ApiErrorResponse).message,
    });
  });
});
