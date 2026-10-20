import { API_ERROR_CODES } from '@oneul-sai/contracts';
import type { ApiHttpException, CallerUser } from '@oneul-sai/service-kit';
import { fakeLogger, loggedText } from '../testing/fakes.js';
import { MEMBER_LOOKUP_TIMEOUT_MS, MemberClient } from './member-client.js';

// SPEC-003 13절 단위: 위임 호출(가짜 fetch) — 보내는 요청과 7절 "위임 호출 응답 해석" 표의 모든 줄.

const CALLER: CallerUser = {
  id: '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01',
  role: 'MEMBER',
};
const TOKEN = 'SECRET-INTERNAL-TOKEN-0123456789abcdef';

const profile = (overrides: Record<string, unknown> = {}) => ({
  id: CALLER.id,
  email: 'secret-email@example.com',
  name: 'SECRET-NAME',
  gender: 'MALE',
  birthYear: 1994,
  phone: '01099998888',
  role: 'MEMBER',
  status: 'ACTIVE',
  marketingConsent: false,
  createdAt: '2026-09-22T00:00:00.000Z',
  ...overrides,
});

function build(respond: (init: RequestInit) => Promise<Response>) {
  const logger = fakeLogger();
  const fetch = vi.fn(
    async (_url: string | URL | Request, init?: RequestInit) =>
      respond(init ?? {}),
  );
  const client = new MemberClient({
    baseUrl: 'http://member.internal:4001/',
    internalToken: TOKEN,
    fetch: fetch as unknown as typeof globalThis.fetch,
    logger,
  });
  return { client, fetch, logger };
}

const json = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

async function errorOf(promise: Promise<unknown>): Promise<ApiHttpException> {
  return (await promise.catch((e: unknown) => e)) as ApiHttpException;
}

describe('MemberClient.lookupSelf — request', () => {
  it('GETs the fixed /members/me path with the caller headers unchanged and the internal token', async () => {
    const { client, fetch } = build(json(200, profile()));
    await client.lookupSelf(CALLER, 'req-1');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('http://member.internal:4001/api/v1/members/me');
    expect(init?.method).toBe('GET');
    expect(init?.headers).toEqual({
      'x-user-id': CALLER.id,
      'x-user-role': 'MEMBER',
      'x-request-id': 'req-1',
      'x-internal-token': TOKEN,
    });
    expect(init?.headers).not.toHaveProperty('authorization');
    expect(init?.redirect).toBe('manual');
  });

  it('returns only gender for an ACTIVE MEMBER — no birthYear (D15), no email · name · phone', async () => {
    const { client, logger } = build(json(200, profile()));
    await expect(client.lookupSelf(CALLER, 'r')).resolves.toEqual({
      gender: 'MALE',
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not read birthYear — null passes', async () => {
    const { client } = build(json(200, profile({ birthYear: null })));
    await expect(client.lookupSelf(CALLER, 'r')).resolves.toEqual({
      gender: 'MALE',
    });
  });
});

describe('MemberClient.lookupSelf — response table (SPEC-003 7절)', () => {
  it.each([
    [
      '401 UNAUTHENTICATED (withdrawn)',
      401,
      API_ERROR_CODES.UNAUTHENTICATED,
      401,
    ],
    ['403 ACCOUNT_SUSPENDED', 403, API_ERROR_CODES.ACCOUNT_SUSPENDED, 403],
  ] as const)(
    '%s → same status without a log',
    async (_label, status, code, expected) => {
      const { client, logger } = build(
        json(status, { statusCode: status, code }),
      );
      const error = await errorOf(client.lookupSelf(CALLER, 'r'));
      expect(error.getStatus()).toBe(expected);
      expect(error.code).toBe(code);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it('200 SUSPENDED → 403 ACCOUNT_SUSPENDED', async () => {
    const { client } = build(json(200, profile({ status: 'SUSPENDED' })));
    const error = await errorOf(client.lookupSelf(CALLER, 'r'));
    expect(error.getStatus()).toBe(403);
    expect(error.code).toBe(API_ERROR_CODES.ACCOUNT_SUSPENDED);
  });

  it.each([
    ['WITHDRAWN', profile({ status: 'WITHDRAWN' })],
    ['ADMIN', profile({ role: 'ADMIN' })],
    ['gender null', profile({ gender: null })],
    ['a malformed body', { status: 'ACTIVE' }],
  ])('200 with %s → 503 SERVICE_BUSY + error log', async (_label, body) => {
    const { client, logger } = build(json(200, body));
    const error = await errorOf(client.lookupSelf(CALLER, 'r'));
    expect(error.getStatus()).toBe(503);
    expect(error.code).toBe(API_ERROR_CODES.SERVICE_BUSY);
    expect(logger.error).toHaveBeenCalledWith(
      'application.member_lookup_failed',
      expect.objectContaining({ status: 200, requestId: 'r' }),
    );
  });

  it.each([
    ['401 INTERNAL_TOKEN_INVALID', 401, 'INTERNAL_TOKEN_INVALID'],
    ['403 FORBIDDEN', 403, 'FORBIDDEN'],
    ['401 without code', 401, undefined],
    ['404', 404, 'MEMBER_NOT_FOUND'],
  ] as const)(
    '%s → 503 SERVICE_BUSY + error log with the member code (configuration error)',
    async (_label, status, code) => {
      const { client, logger } = build(json(status, { message: 'x', code }));
      const error = await errorOf(client.lookupSelf(CALLER, 'r'));
      expect(error.getStatus()).toBe(503);
      expect(error.code).toBe(API_ERROR_CODES.SERVICE_BUSY);
      expect(logger.error).toHaveBeenCalledWith(
        'application.member_lookup_failed',
        expect.objectContaining({ status, code, requestId: 'r' }),
      );
    },
  );

  it('a redirect is not followed → 503 + error log (configuration error)', async () => {
    const { client, logger } = build(
      async () =>
        new Response(null, {
          status: 307,
          headers: { location: 'http://elsewhere.example/api/v1/members/me' },
        }),
    );
    const error = await errorOf(client.lookupSelf(CALLER, 'r'));
    expect(error.getStatus()).toBe(503);
    expect(logger.error).toHaveBeenCalledWith(
      'application.member_lookup_failed',
      expect.objectContaining({ status: 307 }),
    );
  });

  it('a 4xx body that is not JSON → 503 + error log', async () => {
    const { client, logger } = build(
      async () => new Response('nope', { status: 400 }),
    );
    const error = await errorOf(client.lookupSelf(CALLER, 'r'));
    expect(error.getStatus()).toBe(503);
    expect(logger.error).toHaveBeenCalled();
  });

  it.each([
    ['500', json(500, { code: 'INTERNAL' })],
    ['503 (member busy)', json(503, { code: 'SERVICE_BUSY' })],
    [
      'a network error',
      async () => {
        throw new TypeError('fetch failed');
      },
    ],
  ])('%s → 503 SERVICE_BUSY + warn log', async (_label, respond) => {
    const { client, logger } = build(respond);
    const error = await errorOf(client.lookupSelf(CALLER, 'r'));
    expect(error.getStatus()).toBe(503);
    expect(error.code).toBe(API_ERROR_CODES.SERVICE_BUSY);
    expect(logger.warn).toHaveBeenCalledWith(
      'application.member_lookup_failed',
      expect.objectContaining({ requestId: 'r' }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it(`gives up after ${MEMBER_LOOKUP_TIMEOUT_MS}ms → 503 + warn TimeoutError`, async () => {
    vi.useFakeTimers();
    try {
      const { client, logger } = build(
        (init) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
      const pending = errorOf(client.lookupSelf(CALLER, 'r'));
      await vi.advanceTimersByTimeAsync(MEMBER_LOOKUP_TIMEOUT_MS - 1);
      expect(logger.warn).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      const error = await pending;
      expect(error.getStatus()).toBe(503);
      expect(logger.warn).toHaveBeenCalledWith(
        'application.member_lookup_failed',
        expect.objectContaining({ errorName: 'TimeoutError' }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('never logs the body or header values', async () => {
    const leaky = profile({ status: 'WITHDRAWN' });
    const { client, logger } = build(json(200, leaky));
    await errorOf(client.lookupSelf(CALLER, 'r'));
    const text = loggedText(logger);
    for (const value of [
      TOKEN,
      'SECRET-NAME',
      'secret-email',
      '01099998888',
      CALLER.id,
    ]) {
      expect(text).not.toContain(value);
    }
  });
});
