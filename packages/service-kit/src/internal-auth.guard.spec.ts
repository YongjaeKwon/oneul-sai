import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import {
  HEADER_INTERNAL_TOKEN,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
} from '@oneul-sai/contracts';
import { ApiHttpException } from './api-error.js';
import type { RequestWithUser } from './current-user.js';
import {
  INTERNAL_AUTH_EXEMPT_PATHS,
  InternalAuthGuard,
  parseCallerHeaders,
  safeEqual,
} from './internal-auth.guard.js';
import { IS_PUBLIC_KEY } from './public.js';
import { fakeExecutionContext, fakeRequest } from './testing/fakes.js';

const TOKEN = 'oneul-sai-test-internal-api-token-32chars!!';
const USER_ID = '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01';

function publicHandler() {}
Reflect.defineMetadata(IS_PUBLIC_KEY, true, publicHandler);
function protectedHandler() {}

function run(
  headers: Record<string, string>,
  options: { url?: string; handler?: () => unknown } = {},
) {
  const guard = new InternalAuthGuard(new Reflector(), TOKEN);
  const request = fakeRequest({
    url: options.url ?? '/api/v1/members/me',
    headers,
  }) as RequestWithUser;
  const context = fakeExecutionContext({
    request,
    handler: options.handler ?? protectedHandler,
  });
  try {
    return { allowed: guard.canActivate(context), request };
  } catch (error) {
    return { error: error as ApiHttpException, request };
  }
}

describe('InternalAuthGuard', () => {
  it('rejects a missing or wrong x-internal-token with 401 INTERNAL_TOKEN_INVALID, even on @Public() handlers', () => {
    const missing = run({}, { handler: publicHandler });
    expect(missing.error?.getStatus()).toBe(401);
    expect(missing.error?.code).toBe('INTERNAL_TOKEN_INVALID');

    const wrong = run(
      { [HEADER_INTERNAL_TOKEN]: 'x'.repeat(TOKEN.length) },
      { handler: publicHandler },
    );
    expect(wrong.error?.code).toBe('INTERNAL_TOKEN_INVALID');
  });

  it('skips the internal token only for the exact /health path (health probes call the service directly)', () => {
    expect(INTERNAL_AUTH_EXEMPT_PATHS).toEqual(['/health']);

    const health = run({}, { url: '/health' });
    expect(health.allowed).toBe(true);
    expect(health.request.user).toBeUndefined();
    expect(run({}, { url: '/health?probe=1' }).allowed).toBe(true);
  });

  it.each([
    // Express 5 라우팅은 대소문자를 구분하지 않아 이 경로들이 /api/v1 핸들러로 간다 (SPEC-002 12절).
    '/API/V1/members',
    '/API/V1/members/me',
    '/API/V1/events',
    '/Api/v1/meetups',
    '/api/V1/members/me',
    // 허용 목록에 없는 그 밖의 경로 — 비슷해 보여도 글자가 다르면 검사한다.
    '/other',
    '/healthz',
    '/HEALTH',
    '/health/',
    '/api/v1/health',
    '/api/v1/members/../../../health',
    // Swagger는 Nest 가드를 거치지 않는다(SPEC-002 17절). 거치게 되더라도 예외가 아니다.
    '/docs',
    '/docs-json',
  ])(
    'checks the internal token on %s (fail closed) → 401 INTERNAL_TOKEN_INVALID',
    (url) => {
      for (const handler of [publicHandler, protectedHandler]) {
        const result = run({}, { url, handler });
        expect(result.error).toBeInstanceOf(ApiHttpException);
        expect(result.error?.getStatus()).toBe(401);
        expect(result.error?.code).toBe('INTERNAL_TOKEN_INVALID');
      }
    },
  );

  it('lets @Public() handlers through with the token and no user headers', () => {
    const result = run(
      { [HEADER_INTERNAL_TOKEN]: TOKEN },
      { handler: publicHandler },
    );
    expect(result.allowed).toBe(true);
    expect(result.request.user).toBeUndefined();
  });

  it('requires a UUID x-user-id and a MemberRole x-user-role on protected handlers, then exposes the caller', () => {
    const ok = run({
      [HEADER_INTERNAL_TOKEN]: TOKEN,
      [HEADER_USER_ID]: USER_ID,
      [HEADER_USER_ROLE]: 'ADMIN',
    });
    expect(ok.allowed).toBe(true);
    expect(ok.request.user).toEqual({ id: USER_ID, role: 'ADMIN' });

    const none = run({ [HEADER_INTERNAL_TOKEN]: TOKEN });
    expect(none.error?.getStatus()).toBe(401);
    expect(none.error?.code).toBe('UNAUTHENTICATED');

    const badId = run({
      [HEADER_INTERNAL_TOKEN]: TOKEN,
      [HEADER_USER_ID]: 'not-a-uuid',
      [HEADER_USER_ROLE]: 'MEMBER',
    });
    expect(badId.error?.code).toBe('UNAUTHENTICATED');

    const badRole = run({
      [HEADER_INTERNAL_TOKEN]: TOKEN,
      [HEADER_USER_ID]: USER_ID,
      [HEADER_USER_ROLE]: 'ROOT',
    });
    expect(badRole.error?.code).toBe('UNAUTHENTICATED');
  });

  it('compares tokens in constant time and parses headers strictly', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(
      parseCallerHeaders({
        [HEADER_USER_ID]: [USER_ID],
        [HEADER_USER_ROLE]: 'MEMBER',
      }),
    ).toBeNull();
    expect(
      parseCallerHeaders({
        [HEADER_USER_ID]: USER_ID,
        [HEADER_USER_ROLE]: 'MEMBER',
      }),
    ).toEqual({
      id: USER_ID,
      role: 'MEMBER',
    });
  });
});

describe('InternalAuthGuard construction', () => {
  it('rejects a short or empty internal token', () => {
    expect(() => new InternalAuthGuard(new Reflector(), '')).toThrow();
    expect(
      () => new InternalAuthGuard(new Reflector(), 'x'.repeat(31)),
    ).toThrow();
  });

  it('keeps the exempt path list frozen', () => {
    expect(Object.isFrozen(INTERNAL_AUTH_EXEMPT_PATHS)).toBe(true);
  });
});
