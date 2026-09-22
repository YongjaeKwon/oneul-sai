import { generateKeyPair, SignJWT } from 'jose';
import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import {
  HEADER_INTERNAL_TOKEN,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_TYP,
} from '@oneul-sai/contracts';
import { decodeAccessSecret } from '../auth/jwt.js';
import {
  fakeLogger,
  fakeRequest,
  fakeResponse,
} from '../testing/http-fakes.js';
import {
  createAuthMiddleware,
  stripInternalHeaders,
} from './auth.middleware.js';

const SECRET_B64 = Buffer.alloc(32, 7).toString('base64');
const secret = decodeAccessSecret(SECRET_B64);
const MEMBER_ID = '11111111-1111-4111-8111-111111111111';

interface TokenOptions {
  key?: Uint8Array | CryptoKey;
  alg?: string;
  typ?: string;
  iss?: string;
  aud?: string;
  role?: unknown;
  sub?: string;
  iat?: number;
  exp?: number | string;
}

async function signToken(options: TokenOptions = {}): Promise<string> {
  const jwt = new SignJWT({ role: options.role ?? 'MEMBER' })
    .setProtectedHeader({
      alg: options.alg ?? 'HS256',
      typ: options.typ ?? JWT_TYP,
    })
    .setIssuer(options.iss ?? JWT_ISSUER)
    .setAudience(options.aud ?? JWT_AUDIENCE)
    .setIssuedAt(options.iat)
    .setExpirationTime(options.exp ?? '15m');
  if (options.sub !== undefined) {
    jwt.setSubject(options.sub);
  }
  return jwt.sign(options.key ?? secret);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function run(init: Parameters<typeof fakeRequest>[0]) {
  const logger = fakeLogger();
  const middleware = createAuthMiddleware({ secret, logger });
  const req = fakeRequest({
    url: '/api/v1/members/me?query=010',
    headers: { [HEADER_REQUEST_ID]: 'req-1' },
    ...init,
  });
  const response = fakeResponse();
  const next = vi.fn();
  await middleware(req, response.res, next);
  return { req, response, next, logger };
}

function bearer(token: string, extra: Record<string, string> = {}) {
  return {
    headers: {
      [HEADER_REQUEST_ID]: 'req-1',
      authorization: `Bearer ${token}`,
      ...extra,
    },
  };
}

function codeOf(body: unknown): string {
  return (body as { code: string }).code;
}

describe('stripInternalHeaders', () => {
  it('x-user- 접두사 헤더와 x-internal-token을 모두 지우고 다른 헤더는 남긴다', () => {
    const req = fakeRequest({
      headers: {
        [HEADER_USER_ID]: 'spoofed',
        [HEADER_USER_ROLE]: 'ADMIN',
        'x-user-anything': 'x',
        [HEADER_INTERNAL_TOKEN]: 'guess',
        'x-request-id': 'keep',
        'content-type': 'application/json',
      },
    });

    stripInternalHeaders(req);

    expect(req.headers).toEqual({
      'x-request-id': 'keep',
      'content-type': 'application/json',
    });
  });
});

describe('authMiddleware', () => {
  it('Bearer 없음 → 클라이언트의 x-user-* 를 지우고 헤더 없이 next()', async () => {
    const { req, next, response } = await run({
      headers: {
        [HEADER_REQUEST_ID]: 'req-1',
        [HEADER_USER_ID]: 'spoofed',
        [HEADER_USER_ROLE]: 'ADMIN',
        'x-user-anything': 'x',
      },
    });

    expect(next).toHaveBeenCalledOnce();
    expect(response.body).toBeUndefined();
    expect(req.headers[HEADER_USER_ID]).toBeUndefined();
    expect(req.headers[HEADER_USER_ROLE]).toBeUndefined();
    expect(req.headers['x-user-anything']).toBeUndefined();
  });

  it('정상 토큰 → 클라이언트 x-user-* 는 버리고 클레임으로 채운 뒤 Authorization을 지우고 next()', async () => {
    const token = await signToken({ sub: MEMBER_ID });
    const { req, next, logger } = await run(
      bearer(token, {
        [HEADER_USER_ID]: 'spoofed',
        [HEADER_USER_ROLE]: 'ADMIN',
      }),
    );

    expect(next).toHaveBeenCalledOnce();
    expect(req.headers[HEADER_USER_ID]).toBe(MEMBER_ID);
    expect(req.headers[HEADER_USER_ROLE]).toBe('MEMBER');
    expect(req.headers.authorization).toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('ADMIN 역할 토큰도 형식만 확인해 그대로 넘긴다 — 역할 판단은 서비스가 한다', async () => {
    const token = await signToken({ sub: MEMBER_ID, role: 'ADMIN' });
    const { req, next } = await run(bearer(token));

    expect(next).toHaveBeenCalledOnce();
    expect(req.headers[HEADER_USER_ROLE]).toBe('ADMIN');
  });

  it('OPTIONS는 Authorization이 있어도 검증 없이 통과한다(preflight)', async () => {
    const { next, req } = await run({
      method: 'OPTIONS',
      headers: {
        authorization: 'Bearer garbage',
        [HEADER_USER_ID]: 'spoofed',
      },
    });

    expect(next).toHaveBeenCalledOnce();
    expect(req.headers[HEADER_USER_ID]).toBeUndefined();
  });

  it('만료 → 401 TOKEN_EXPIRED, ApiErrorResponse 형태 + requestId + query 없는 path', async () => {
    const now = nowSeconds();
    const token = await signToken({
      sub: MEMBER_ID,
      iat: now - 1000,
      exp: now - 60,
    });
    const { response, next, logger } = await run(bearer(token));

    expect(next).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      code: 'TOKEN_EXPIRED',
      message: expect.any(String),
      path: '/api/v1/members/me',
      requestId: 'req-1',
      timestamp: expect.any(String),
    });
    expect(logger.warn).toHaveBeenCalledWith('gateway.auth.rejected', {
      code: 'TOKEN_EXPIRED',
      path: '/api/v1/members/me',
      requestId: 'req-1',
    });
  });

  it('exp가 20초 지난 토큰은 clockTolerance 30초 안이라 통과한다', async () => {
    const now = nowSeconds();
    const token = await signToken({
      sub: MEMBER_ID,
      iat: now - 1000,
      exp: now - 20,
    });
    const { next, req } = await run(bearer(token));

    expect(next).toHaveBeenCalledOnce();
    expect(req.headers[HEADER_USER_ID]).toBe(MEMBER_ID);
  });

  it('서명 변조 → 401 UNAUTHENTICATED, x-user-* 는 채우지 않는다', async () => {
    const token = await signToken({ sub: MEMBER_ID });
    const tampered = `${token.slice(0, -4)}AAAA`;
    const { response, next, req } = await run(bearer(tampered));

    expect(next).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(401);
    expect(codeOf(response.body)).toBe('UNAUTHENTICATED');
    expect(req.headers[HEADER_USER_ID]).toBeUndefined();
  });

  it('다른 시크릿으로 서명한 토큰 → 401 UNAUTHENTICATED', async () => {
    const token = await signToken({
      sub: MEMBER_ID,
      key: decodeAccessSecret(Buffer.alloc(32, 9).toString('base64')),
    });
    const { response } = await run(bearer(token));

    expect(response.statusCode).toBe(401);
    expect(codeOf(response.body)).toBe('UNAUTHENTICATED');
  });

  it('alg: none 거부', async () => {
    const [, payload] = (await signToken({ sub: MEMBER_ID })).split('.');
    const header = Buffer.from(
      JSON.stringify({ alg: 'none', typ: JWT_TYP }),
    ).toString('base64url');
    const { response } = await run(bearer(`${header}.${payload}.`));

    expect(response.statusCode).toBe(401);
    expect(codeOf(response.body)).toBe('UNAUTHENTICATED');
  });

  it('RS256 토큰 거부 (algorithms: HS256 고정)', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const token = await signToken({
      sub: MEMBER_ID,
      alg: 'RS256',
      key: privateKey,
    });
    const { response } = await run(bearer(token));

    expect(response.statusCode).toBe(401);
    expect(codeOf(response.body)).toBe('UNAUTHENTICATED');
  });

  it.each([
    ['aud', { aud: 'other-api' }],
    ['iss', { iss: 'someone-else' }],
    ['typ', { typ: 'JWT' }],
  ])('%s 불일치 → 401 UNAUTHENTICATED', async (_claim, override) => {
    const token = await signToken({ sub: MEMBER_ID, ...override });
    const { response, next } = await run(bearer(token));

    expect(next).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(401);
    expect(codeOf(response.body)).toBe('UNAUTHENTICATED');
  });

  it.each([
    ['sub 없음', {}],
    ['sub가 UUID 아님', { sub: 'member-1' }],
    ['role 없음(숫자)', { sub: MEMBER_ID, role: 42 }],
    ['role이 MemberRole 밖(ROOT)', { sub: MEMBER_ID, role: 'ROOT' }],
  ])('클레임 형식 위반(%s) → 401 UNAUTHENTICATED', async (_label, claims) => {
    const token = await signToken(claims);
    const { response, next, req } = await run(bearer(token));

    expect(next).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(401);
    expect(codeOf(response.body)).toBe('UNAUTHENTICATED');
    expect(req.headers[HEADER_USER_ID]).toBeUndefined();
  });

  it('Bearer 형식이 아닌 Authorization → 401 UNAUTHENTICATED', async () => {
    const { response, next } = await run({
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(next).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(401);
    expect(codeOf(response.body)).toBe('UNAUTHENTICATED');
  });

  it('Bearer 스킴은 대 · 소문자를 가리지 않는다', async () => {
    const token = await signToken({ sub: MEMBER_ID });
    const { next } = await run({
      headers: { authorization: `bearer ${token}` },
    });

    expect(next).toHaveBeenCalledOnce();
  });
});
