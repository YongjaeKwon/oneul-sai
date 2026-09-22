import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import {
  fakeLogger,
  fakeRequest,
  fakeResponse,
} from '../testing/http-fakes.js';
import {
  createRateLimitMiddleware,
  isRateLimitedRoute,
  maskIp,
  normalizeRoutePath,
} from './rate-limit.middleware.js';

function setup(limitPerMinute = 10) {
  let current = 1_000_000;
  const logger = fakeLogger();
  const middleware = createRateLimitMiddleware({
    limitPerMinute,
    now: () => current,
    logger,
    maxTrackedIps: 2,
  });
  const call = (init: Parameters<typeof fakeRequest>[0] = {}) => {
    const req = fakeRequest({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { [HEADER_REQUEST_ID]: 'req-1' },
      ...init,
    });
    const response = fakeResponse();
    const next = vi.fn();
    middleware(req, response.res, next);
    return { response, next };
  };
  const advance = (ms: number) => {
    current += ms;
  };
  return { call, advance, logger };
}

describe('isRateLimitedRoute', () => {
  it.each([
    ['POST', '/api/v1/auth/login', true],
    ['POST', '/api/v1/auth/refresh', true],
    ['POST', '/api/v1/members', true],
    ['POST', '/api/v1/members/', true],
    ['POST', '/API/v1/Auth/LOGIN', true],
    ['POST', '/api/v1/auth/logi%6E', true],
    ['POST', '/api/v1/auth/login%ZZ', false],
    ['POST', '/api/v1/auth/password', true],
    ['PATCH', '/api/v1/members/me', true],
    ['DELETE', '/api/v1/members/me', true],
    ['GET', '/api/v1/members/me', false],
    ['GET', '/api/v1/members', false],
    ['POST', '/api/v1/auth/logout', false],
    ['POST', '/api/v1/auth/logout-all', false],
    ['POST', '/api/v1/members/me', false],
    [
      'PATCH',
      '/api/v1/members/11111111-1111-4111-8111-111111111111/status',
      false,
    ],
    ['OPTIONS', '/api/v1/auth/login', false],
  ])('%s %s → %s', (method, path, expected) => {
    expect(isRateLimitedRoute(method, path)).toBe(expected);
  });

  it('Bearer가 있는 비밀번호 확인 경로도 같은 버킷에서 센다', () => {
    const { call } = setup(3);
    const authorization = 'Bearer some-access-token';

    expect(
      call({ url: '/api/v1/auth/password', headers: { authorization } }).next,
    ).toHaveBeenCalledOnce();
    expect(
      call({
        method: 'PATCH',
        url: '/api/v1/members/me',
        headers: { authorization },
      }).next,
    ).toHaveBeenCalledOnce();
    expect(
      call({
        method: 'DELETE',
        url: '/api/v1/members/me',
        headers: { authorization },
      }).next,
    ).toHaveBeenCalledOnce();
    expect(
      call({
        method: 'DELETE',
        url: '/api/v1/members/me',
        headers: { authorization },
      }).response.statusCode,
    ).toBe(429);
  });

  it('normalizeRoutePath는 끝 슬래시를 떼고 소문자로 만든다', () => {
    expect(normalizeRoutePath('/api/v1/Members///')).toBe('/api/v1/members');
    expect(normalizeRoutePath('/')).toBe('/');
  });
});

describe('maskIp', () => {
  it.each([
    ['1.2.3.4', '1.2.3.*'],
    ['::ffff:10.0.0.7', '10.0.0.*'],
    ['2001:db8:85a3:0:0:8a2e:370:7334', '2001:db8:85a3:0:*'],
    ['::1', '::*'],
    ['unknown', '*'],
  ])('%s → %s', (ip, masked) => {
    expect(maskIp(ip)).toBe(masked);
  });
});

describe('rateLimitMiddleware', () => {
  it('같은 IP의 분당 11번째 로그인 → 429 TOO_MANY_REQUESTS + Retry-After', () => {
    const { call, logger } = setup(10);

    for (let i = 0; i < 10; i += 1) {
      expect(call().next).toHaveBeenCalledOnce();
    }

    const eleventh = call({ url: '/api/v1/auth/login?x=1', ip: '127.0.0.1' });
    expect(eleventh.next).not.toHaveBeenCalled();
    expect(eleventh.response.statusCode).toBe(429);
    expect(eleventh.response.headers['retry-after']).toBe('6');
    expect(eleventh.response.body).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      code: 'TOO_MANY_REQUESTS',
      message: expect.any(String),
      path: '/api/v1/auth/login',
      requestId: 'req-1',
      timestamp: expect.any(String),
    });
    expect(logger.warn).toHaveBeenCalledWith('gateway.rate_limited', {
      path: '/api/v1/auth/login',
      ip: '127.0.0.*',
      requestId: 'req-1',
    });
  });

  it('다른 IP는 독립된 버킷이다', () => {
    const { call } = setup(10);

    for (let i = 0; i < 10; i += 1) {
      call({ ip: '10.0.0.1' });
    }
    expect(call({ ip: '10.0.0.1' }).response.statusCode).toBe(429);
    expect(call({ ip: '10.0.0.2' }).next).toHaveBeenCalledOnce();
  });

  it('제한 대상 밖 경로(GET /members/me)는 횟수와 무관하게 통과한다', () => {
    const { call } = setup(10);

    for (let i = 0; i < 50; i += 1) {
      const result = call({ method: 'GET', url: '/api/v1/members/me' });
      expect(result.next).toHaveBeenCalledOnce();
    }
  });

  it('세 경로(login · refresh · 가입)가 IP당 하나의 버킷을 나눠 쓴다', () => {
    const { call } = setup(3);

    expect(call({ url: '/api/v1/auth/login' }).next).toHaveBeenCalledOnce();
    expect(call({ url: '/api/v1/auth/refresh' }).next).toHaveBeenCalledOnce();
    expect(call({ url: '/api/v1/members' }).next).toHaveBeenCalledOnce();
    expect(call({ url: '/api/v1/members/' }).response.statusCode).toBe(429);
  });

  it('시간이 지나면 분당 한도만큼 다시 채워진다', () => {
    const { call, advance } = setup(10);

    for (let i = 0; i < 10; i += 1) {
      call();
    }
    expect(call().response.statusCode).toBe(429);

    advance(6_000); // 10/분 → 6초에 1개
    expect(call().next).toHaveBeenCalledOnce();
    expect(call().response.statusCode).toBe(429);

    advance(60_000);
    for (let i = 0; i < 10; i += 1) {
      expect(call().next).toHaveBeenCalledOnce();
    }
    expect(call().response.statusCode).toBe(429);
  });

  it('추적 IP 상한을 넘으면 1분 넘게 조용한 버킷을 정리한다(메모리 상한)', () => {
    const { call, advance } = setup(1);

    call({ ip: '10.0.0.1' });
    call({ ip: '10.0.0.2' });
    advance(61_000);
    call({ ip: '10.0.0.3' }); // size 3 > maxTrackedIps 2 → 1 · 2 정리

    // 정리된 IP는 새 버킷(가득 참)으로 시작한다
    expect(call({ ip: '10.0.0.1' }).next).toHaveBeenCalledOnce();
    // 방금 쓴 IP는 남아 있다
    expect(call({ ip: '10.0.0.3' }).response.statusCode).toBe(429);
  });
});
