import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import {
  fakeLogger,
  fakeRequest,
  fakeResponse,
  type FakeRequestInit,
} from '../testing/http-fakes.js';
import {
  createOriginCheckMiddleware,
  isOriginCheckedRoute,
} from './origin-check.middleware.js';

const ALLOWED = ['http://localhost:3000', 'http://localhost:3001'];

function call(init: FakeRequestInit) {
  const logger = fakeLogger();
  const middleware = createOriginCheckMiddleware({
    allowedOrigins: ALLOWED,
    logger,
  });
  const req = fakeRequest({
    method: 'POST',
    url: '/api/v1/auth/login',
    ...init,
    headers: { [HEADER_REQUEST_ID]: 'req-1', ...init.headers },
  });
  const response = fakeResponse();
  const next = vi.fn();
  middleware(req, response.res, next);
  return { response, next, logger };
}

describe('isOriginCheckedRoute', () => {
  it.each([
    ['POST', '/api/v1/auth/login', true],
    ['POST', '/api/v1/auth/refresh', true],
    ['POST', '/api/v1/auth/logout', true],
    ['POST', '/api/v1/auth/logout-all', true],
    ['POST', '/api/v1/auth/password', true],
    ['POST', '/api/v1/auth/LOGIN', true],
    ['GET', '/api/v1/auth/login', false],
    ['POST', '/api/v1/members', false],
    ['POST', '/api/v1/authx/login', false],
    ['GET', '/api/v1/members/me', false],
  ])('%s %s → %s', (method, path, expected) => {
    expect(isOriginCheckedRoute(method, path)).toBe(expected);
  });
});

describe('originCheckMiddleware', () => {
  it('허용 목록 밖 Origin의 POST /auth/login → 403 ORIGIN_NOT_ALLOWED (origin 값은 로그에 없음)', () => {
    const { response, next, logger } = call({
      url: '/api/v1/auth/login?x=1',
      headers: { origin: 'https://evil.example' },
    });

    expect(next).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      code: 'ORIGIN_NOT_ALLOWED',
      message: expect.any(String),
      path: '/api/v1/auth/login',
      requestId: 'req-1',
      timestamp: expect.any(String),
    });
    expect(logger.warn).toHaveBeenCalledWith('gateway.auth.rejected', {
      code: 'ORIGIN_NOT_ALLOWED',
      path: '/api/v1/auth/login',
      requestId: 'req-1',
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('evil');
  });

  it('허용 목록 안 Origin → 통과', () => {
    const { next, response } = call({
      headers: { origin: 'http://localhost:3001' },
    });

    expect(next).toHaveBeenCalledOnce();
    expect(response.body).toBeUndefined();
  });

  it('Origin 없음(비브라우저 호출) → 통과', () => {
    const { next } = call({ headers: {} });

    expect(next).toHaveBeenCalledOnce();
  });

  it('Origin: null(불투명 출처)은 목록에 없으므로 403', () => {
    const { response } = call({ headers: { origin: 'null' } });

    expect(response.statusCode).toBe(403);
  });

  it('GET /members/me + 밖의 Origin → 통과(대상 밖)', () => {
    const { next } = call({
      method: 'GET',
      url: '/api/v1/members/me',
      headers: { origin: 'https://evil.example' },
    });

    expect(next).toHaveBeenCalledOnce();
  });
});
