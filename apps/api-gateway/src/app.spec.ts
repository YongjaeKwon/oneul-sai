// Gateway 앱 전체(미들웨어 순서 · CORS · 프록시)를 임시 포트에 띄워 검증한다.
// 가짜 upstream(member-service 자리)은 받은 요청을 기록하고 Set-Cookie를 돌려준다.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import {
  HEADER_INTERNAL_TOKEN,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_TYP,
} from '@oneul-sai/contracts';
import { SignJWT } from 'jose';
import { createGatewayApp } from './app.js';
import { decodeAccessSecret } from './auth/jwt.js';
import { envSchema } from './env.schema.js';

const SECRET_B64 = Buffer.alloc(32, 3).toString('base64');
const INTERNAL_TOKEN = 'e2e-internal-token-e2e-internal-token';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const WEB_ORIGIN = 'http://localhost:3000';
const UPSTREAM_COOKIE =
  'onulsai_rt_web=abc; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax';

interface ReceivedRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

interface Upstream {
  server: Server;
  url: string;
  received: ReceivedRequest[];
}

async function startUpstream(): Promise<Upstream> {
  const received: ReceivedRequest[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
    });
    req.on('end', () => {
      received.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: { ...req.headers },
        body,
      });
      res.setHeader('Set-Cookie', [UPSTREAM_COOKIE]);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}`, received };
}

async function startGateway(
  upstreamUrl: string,
  overrides: Record<string, string> = {},
): Promise<{ app: INestApplication; url: string }> {
  const env = envSchema.parse({
    JWT_ACCESS_SECRET: SECRET_B64,
    INTERNAL_API_TOKEN: INTERNAL_TOKEN,
    MEMBER_SERVICE_URL: upstreamUrl,
    RATE_LIMIT_AUTH_PER_MINUTE: '100',
    ...overrides,
  });
  const app = await createGatewayApp(env, { logger: false });
  await app.listen(0, '127.0.0.1');
  const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
  return { app, url: `http://127.0.0.1:${port}` };
}

async function accessToken(
  claims: { sub?: string; role?: string; exp?: number } = {},
): Promise<string> {
  return new SignJWT({ role: claims.role ?? 'MEMBER' })
    .setProtectedHeader({ alg: 'HS256', typ: JWT_TYP })
    .setSubject(claims.sub ?? MEMBER_ID)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? '15m')
    .sign(decodeAccessSecret(SECRET_B64));
}

async function closeUpstream(upstream: Upstream): Promise<void> {
  await new Promise<void>((resolve) => upstream.server.close(() => resolve()));
}

describe('gateway app', () => {
  let upstream: Upstream;
  let app: INestApplication;
  let gatewayUrl: string;

  beforeAll(async () => {
    upstream = await startUpstream();
    ({ app, url: gatewayUrl } = await startGateway(upstream.url));
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await closeUpstream(upstream);
  });

  beforeEach(() => {
    upstream.received.length = 0;
  });

  it('GET /health는 토큰 · 내부 토큰 없이 200이고 프록시되지 않는다', async () => {
    const response = await fetch(`${gatewayUrl}/health`);

    expect(response.status).toBe(200);
    expect(((await response.json()) as { status: string }).status).toBe('ok');
    expect(response.headers.get(HEADER_REQUEST_ID)).toEqual(expect.any(String));
    expect(upstream.received).toHaveLength(0);
  });

  it('공개 경로 POST /api/v1/members: 토큰 없이 프록시되고, 위조한 x-user-* · x-internal-token은 버려지며, 내부 토큰 · request-id가 붙고 본문 · Set-Cookie는 그대로다', async () => {
    const body = JSON.stringify({ email: 'a@b.c', password: 'password1' });
    const response = await fetch(`${gatewayUrl}/api/v1/members`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADER_REQUEST_ID]: 'req-e2e',
        [HEADER_USER_ID]: 'spoofed',
        [HEADER_USER_ROLE]: 'ADMIN',
        [HEADER_INTERNAL_TOKEN]: 'guessed',
      },
      body,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get(HEADER_REQUEST_ID)).toBe('req-e2e');
    expect(response.headers.getSetCookie()).toEqual([UPSTREAM_COOKIE]);
    expect(upstream.received).toHaveLength(1);
    const [received] = upstream.received;
    expect(received?.method).toBe('POST');
    expect(received?.url).toBe('/api/v1/members');
    expect(received?.body).toBe(body);
    expect(received?.headers[HEADER_USER_ID]).toBeUndefined();
    expect(received?.headers[HEADER_USER_ROLE]).toBeUndefined();
    expect(received?.headers[HEADER_INTERNAL_TOKEN]).toBe(INTERNAL_TOKEN);
    expect(received?.headers[HEADER_REQUEST_ID]).toBe('req-e2e');
  });

  it('정상 Bearer → x-user-id · x-user-role이 붙고 Authorization은 서비스에 가지 않는다', async () => {
    const token = await accessToken();
    const response = await fetch(`${gatewayUrl}/api/v1/members/me?query=010`, {
      headers: {
        authorization: `Bearer ${token}`,
        [HEADER_USER_ID]: 'spoofed',
      },
    });

    expect(response.status).toBe(200);
    expect(upstream.received).toHaveLength(1);
    const [received] = upstream.received;
    expect(received?.url).toBe('/api/v1/members/me?query=010');
    expect(received?.headers[HEADER_USER_ID]).toBe(MEMBER_ID);
    expect(received?.headers[HEADER_USER_ROLE]).toBe('MEMBER');
    expect(received?.headers.authorization).toBeUndefined();
    expect(received?.headers[HEADER_INTERNAL_TOKEN]).toBe(INTERNAL_TOKEN);
  });

  it('Bearer 없는 보호 경로는 헤더 없이 프록시된다 — 401은 서비스가 낸다 (SPEC-001 7절 3번)', async () => {
    const response = await fetch(`${gatewayUrl}/api/v1/members/me`);

    expect(response.status).toBe(200);
    expect(upstream.received).toHaveLength(1);
    expect(upstream.received[0]?.headers[HEADER_USER_ID]).toBeUndefined();
    expect(upstream.received[0]?.headers[HEADER_USER_ROLE]).toBeUndefined();
  });

  it('만료 토큰 → Gateway가 401 TOKEN_EXPIRED, 서비스에 닿지 않는다', async () => {
    const token = await accessToken({
      exp: Math.floor(Date.now() / 1000) - 120,
    });
    const response = await fetch(`${gatewayUrl}/api/v1/members/me`, {
      headers: { authorization: `Bearer ${token}`, [HEADER_REQUEST_ID]: 'r1' },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      code: 'TOKEN_EXPIRED',
      message: expect.any(String),
      path: '/api/v1/members/me',
      requestId: 'r1',
      timestamp: expect.any(String),
    });
    expect(upstream.received).toHaveLength(0);
  });

  it('변조 토큰 → 401 UNAUTHENTICATED', async () => {
    const token = await accessToken();
    const response = await fetch(`${gatewayUrl}/api/v1/members/me`, {
      headers: { authorization: `Bearer ${token.slice(0, -3)}xyz` },
    });

    expect(response.status).toBe(401);
    expect(((await response.json()) as { code: string }).code).toBe(
      'UNAUTHENTICATED',
    );
    expect(upstream.received).toHaveLength(0);
  });

  it('허용 목록 밖 Origin의 POST /api/v1/auth/login → 403 ORIGIN_NOT_ALLOWED, 서비스 미도달, CORS 헤더 없음', async () => {
    const response = await fetch(`${gatewayUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      body: '{}',
    });

    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe(
      'ORIGIN_NOT_ALLOWED',
    );
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(upstream.received).toHaveLength(0);
  });

  it('허용 Origin의 POST /api/v1/auth/login → 프록시 + credentials CORS 헤더 + x-request-id 노출', async () => {
    const response = await fetch(`${gatewayUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ client: 'WEB' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      WEB_ORIGIN,
    );
    expect(response.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
    expect(response.headers.get('access-control-expose-headers')).toContain(
      HEADER_REQUEST_ID,
    );
    expect(response.headers.getSetCookie()).toEqual([UPSTREAM_COOKIE]);
    expect(upstream.received[0]?.url).toBe('/api/v1/auth/login');
  });

  it('OPTIONS preflight는 CORS가 204로 끝내고 프록시로 가지 않는다', async () => {
    const response = await fetch(`${gatewayUrl}/api/v1/auth/refresh`, {
      method: 'OPTIONS',
      headers: {
        origin: WEB_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      WEB_ORIGIN,
    );
    expect(response.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
    expect(
      response.headers.get('access-control-allow-headers')?.toLowerCase(),
    ).toContain('authorization');
    expect(upstream.received).toHaveLength(0);
  });

  it('라우팅 표 밖 /api/v1/unknown은 Nest 404를 ApiErrorResponse로 돌려준다(query 없는 path)', async () => {
    const response = await fetch(`${gatewayUrl}/api/v1/unknown?query=010`, {
      headers: { [HEADER_REQUEST_ID]: 'r404' },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      statusCode: 404,
      path: '/api/v1/unknown',
      requestId: 'r404',
    });
    expect(upstream.received).toHaveLength(0);
  });
});

describe('gateway app — rate limit', () => {
  let upstream: Upstream;
  let app: INestApplication;
  let gatewayUrl: string;

  beforeAll(async () => {
    upstream = await startUpstream();
    ({ app, url: gatewayUrl } = await startGateway(upstream.url, {
      RATE_LIMIT_AUTH_PER_MINUTE: '2',
    }));
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await closeUpstream(upstream);
  });

  it('같은 IP의 분당 3번째 로그인 → 429 TOO_MANY_REQUESTS + Retry-After, 대상 밖 경로는 계속 통과', async () => {
    const login = () =>
      fetch(`${gatewayUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });

    expect((await login()).status).toBe(200);
    expect((await login()).status).toBe(200);

    const third = await login();
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(await third.json()).toMatchObject({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
      path: '/api/v1/auth/login',
    });
    expect(upstream.received).toHaveLength(2);

    expect((await fetch(`${gatewayUrl}/api/v1/members/me`)).status).toBe(200);
    expect(upstream.received).toHaveLength(3);
  });
});
