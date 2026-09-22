import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import {
  HEADER_INTERNAL_TOKEN,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
} from '@oneul-sai/contracts';
import { ApiHttpException } from '../../common/api-error.js';
import { fakeExecutionContext, fakeRequest } from '../../testing/fakes.js';
import type { RequestWithUser } from '../decorators/current-user.js';
import { IS_PUBLIC_KEY } from '../decorators/public.js';
import {
  InternalAuthGuard,
  parseCallerHeaders,
  safeEqual,
} from './internal-auth.guard.js';

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

  it('does not check the internal token outside /api/v1 (health probes call the service directly)', () => {
    expect(run({}, { url: '/health' }).allowed).toBe(true);
  });

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
