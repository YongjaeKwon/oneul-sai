import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import { HEADER_INTERNAL_TOKEN, HEADER_USER_ID } from '@oneul-sai/contracts';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createPrefixPathFilter } from './path-filter.js';
import { attachInternalHeaders } from './proxy-req.js';

const INTERNAL_TOKEN = 'test-internal-token-test-internal-token';

describe('attachInternalHeaders', () => {
  it('x-internal-token과 x-request-id를 붙인다', () => {
    const setHeader = vi.fn();

    attachInternalHeaders(
      { setHeader },
      { headers: { [HEADER_REQUEST_ID]: 'req-1' } },
      INTERNAL_TOKEN,
    );

    expect(setHeader).toHaveBeenCalledWith(HEADER_REQUEST_ID, 'req-1');
    expect(setHeader).toHaveBeenCalledWith(
      HEADER_INTERNAL_TOKEN,
      INTERNAL_TOKEN,
    );
  });

  it('x-request-id가 없으면 내부 토큰만 붙인다', () => {
    const setHeader = vi.fn();

    attachInternalHeaders({ setHeader }, { headers: {} }, INTERNAL_TOKEN);

    expect(setHeader).toHaveBeenCalledTimes(1);
    expect(setHeader).toHaveBeenCalledWith(
      HEADER_INTERNAL_TOKEN,
      INTERNAL_TOKEN,
    );
  });
});

// http-proxy-middleware v3의 실제 pathFilter 처리 · 헤더 부착 · Set-Cookie 통과를 임시 포트 두 개로 확인한다.
describe('proxy through http-proxy-middleware v3', () => {
  let upstream: Server;
  let gateway: Server;
  let gatewayUrl: string;
  let received: { url: string; headers: Record<string, unknown> }[] = [];

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      received.push({ url: req.url ?? '', headers: { ...req.headers } });
      res.setHeader('Set-Cookie', [
        'onulsai_rt_web=abc; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax',
      ]);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) =>
      upstream.listen(0, '127.0.0.1', resolve),
    );
    const target = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

    const proxy = createProxyMiddleware({
      target,
      changeOrigin: true,
      pathFilter: createPrefixPathFilter('/api/v1/members'),
      on: {
        proxyReq: (proxyReq, req) => {
          attachInternalHeaders(proxyReq, req, INTERNAL_TOKEN);
        },
      },
    });
    gateway = createServer((req, res) => {
      req.headers[HEADER_REQUEST_ID] = 'req-e2e';
      void proxy(req, res, () => {
        res.statusCode = 404;
        res.end('not proxied');
      });
    });
    await new Promise<void>((resolve) =>
      gateway.listen(0, '127.0.0.1', resolve),
    );
    gatewayUrl = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => gateway.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  beforeEach(() => {
    received = [];
  });

  it('끝 슬래시 없는 POST /api/v1/members가 내부 토큰 · request-id와 함께 프록시된다', async () => {
    const response = await fetch(`${gatewayUrl}/api/v1/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c' }),
    });

    expect(response.status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0]?.url).toBe('/api/v1/members');
    expect(received[0]?.headers[HEADER_INTERNAL_TOKEN]).toBe(INTERNAL_TOKEN);
    expect(received[0]?.headers[HEADER_REQUEST_ID]).toBe('req-e2e');
    expect(received[0]?.headers[HEADER_USER_ID]).toBeUndefined();
  });

  it('/api/v1/members/me?query=010 도 프록시되고 Set-Cookie가 그대로 통과한다', async () => {
    const response = await fetch(`${gatewayUrl}/api/v1/members/me?query=010`);

    expect(response.status).toBe(200);
    expect(received[0]?.url).toBe('/api/v1/members/me?query=010');
    expect(response.headers.getSetCookie()).toEqual([
      'onulsai_rt_web=abc; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax',
    ]);
  });

  it('prefix 밖(/api/v1/membersx, /health)은 프록시하지 않고 next()로 넘긴다', async () => {
    expect((await fetch(`${gatewayUrl}/api/v1/membersx`)).status).toBe(404);
    expect((await fetch(`${gatewayUrl}/health`)).status).toBe(404);
    expect(received).toHaveLength(0);
  });
});
