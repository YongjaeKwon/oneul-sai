import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import { HEADER_INTERNAL_TOKEN, HEADER_USER_ID } from '@oneul-sai/contracts';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { attachInternalHeaders } from './proxy-req.js';
import { createProxyRoutes } from './routes.js';

const INTERNAL_TOKEN = 'test-internal-token-test-internal-token';
const MEETUP_ID = '11111111-1111-4111-8111-111111111111';

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

    // app.ts처럼 라우팅 표의 prefix마다 프록시를 하나씩 두고 차례로 거친다. 대상은 모두 이 upstream이다.
    const proxies = createProxyRoutes({
      MEMBER_SERVICE_URL: target,
      EVENT_SERVICE_URL: target,
      MATCHING_SERVICE_URL: target,
      PAYMENT_SERVICE_URL: target,
    }).map((route) =>
      createProxyMiddleware({
        target: route.target,
        changeOrigin: true,
        pathFilter: route.pathFilter,
        on: {
          proxyReq: (proxyReq, req) => {
            attachInternalHeaders(proxyReq, req, INTERNAL_TOKEN);
          },
        },
      }),
    );
    gateway = createServer((req, res) => {
      req.headers[HEADER_REQUEST_ID] = 'req-e2e';
      const next = (index: number): void => {
        const proxy = proxies[index];
        if (!proxy) {
          res.statusCode = 404;
          res.end('not proxied');
          return;
        }
        void proxy(req, res, () => next(index + 1));
      };
      next(0);
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

  it('prefix 밖(/api/v1/membersx, /api/v1/meetupsX, /health)은 프록시하지 않고 next()로 넘긴다', async () => {
    expect((await fetch(`${gatewayUrl}/api/v1/membersx`)).status).toBe(404);
    expect((await fetch(`${gatewayUrl}/api/v1/meetupsX`)).status).toBe(404);
    expect((await fetch(`${gatewayUrl}/health`)).status).toBe(404);
    expect(received).toHaveLength(0);
  });

  it.each([
    ['GET', '/api/v1/meetups?page=1'],
    ['POST', '/api/v1/meetups'],
    ['GET', `/api/v1/meetups/${MEETUP_ID}/schedules?status=OPEN`],
    ['POST', `/api/v1/meetups/${MEETUP_ID}/schedules`],
    ['POST', `/api/v1/meetups/${MEETUP_ID}/schedules/batch`],
  ])(
    '%s %s 가 경로 · query 그대로 내부 토큰과 함께 프록시된다',
    async (method, path) => {
      const response = await fetch(`${gatewayUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'POST' ? '{}' : null,
      });

      expect(response.status).toBe(200);
      expect(received).toHaveLength(1);
      expect(received[0]?.url).toBe(path);
      expect(received[0]?.headers[HEADER_INTERNAL_TOKEN]).toBe(INTERNAL_TOKEN);
    },
  );
});
