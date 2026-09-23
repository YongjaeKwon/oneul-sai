import { getPublicEvent, listPublicEvents } from './public-api';

// SPEC-002 13절 단위 "web public-api.ts": 서버에서 부르는 공개 조회 두 함수는 토큰 없이 부르고(D11),
// UUID가 아닌 id로는 Gateway를 부르지 않는다. Next 전용 모듈은 최소한으로 바꿔 끼운다(vi.mock은 import보다 먼저 돈다).
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const EVENT_ID = '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01';

function fakeFetch(body: unknown) {
  const calls: { url: string; headers: Headers }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('public-api (server components)', () => {
  it('lists events without Authorization, with a normalized page', async () => {
    const { calls } = fakeFetch({ items: [], total: 0, page: 1, pageSize: 20 });

    await listPublicEvents('abc');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toMatch(/\/api\/v1\/events\?page=1$/);
    expect(calls[0]?.headers.has('authorization')).toBe(false);
  });

  it('gets one event without Authorization', async () => {
    const { calls } = fakeFetch({ id: EVENT_ID });

    await getPublicEvent(EVENT_ID);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toMatch(new RegExp(`/api/v1/events/${EVENT_ID}$`));
    expect(calls[0]?.headers.has('authorization')).toBe(false);
  });

  it('does not call the Gateway for an id that is not a UUID', () => {
    const { fetch } = fakeFetch({});

    expect(() => getPublicEvent('not-a-uuid')).toThrow('NEXT_NOT_FOUND');
    expect(fetch).not.toHaveBeenCalled();
  });
});
