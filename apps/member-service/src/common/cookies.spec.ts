import { REFRESH_COOKIE_NAMES } from '@oneul-sai/contracts';
import { fakeRequest, fakeResponse } from '../testing/fakes.js';
import {
  clearRefreshCookie,
  readAllRefreshCookies,
  readRefreshCookie,
  setRefreshCookie,
} from './cookies.js';

const env = { COOKIE_SECURE: true, REFRESH_TTL: 2_592_000 };

describe('refresh cookies', () => {
  it('sets onulsai_rt_web as HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth; Max-Age=REFRESH_TTL', () => {
    const response = fakeResponse();
    setRefreshCookie(response.res, 'WEB', 'token-1', env);
    expect(response.cookies).toEqual([
      {
        name: 'onulsai_rt_web',
        value: 'token-1',
        options: {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/api/v1/auth',
          maxAge: 2_592_000_000,
        },
      },
    ]);
  });

  it('sets onulsai_rt_admin with SameSite=Strict and honors COOKIE_SECURE=false locally', () => {
    const response = fakeResponse();
    setRefreshCookie(response.res, 'ADMIN', 'token-2', {
      ...env,
      COOKIE_SECURE: false,
    });
    expect(response.cookies[0]).toMatchObject({
      name: 'onulsai_rt_admin',
      options: { sameSite: 'strict', secure: false, path: '/api/v1/auth' },
    });
  });

  it('clears with Max-Age=0 on the same path', () => {
    const response = fakeResponse();
    clearRefreshCookie(response.res, 'WEB', env);
    expect(response.cookies[0]).toMatchObject({
      name: 'onulsai_rt_web',
      value: '',
      options: { maxAge: 0, path: '/api/v1/auth', httpOnly: true },
    });
  });

  it('reads only the cookie the body client points at (R1) and both for logout-all', () => {
    const request = fakeRequest({
      cookies: {
        [REFRESH_COOKIE_NAMES.WEB]: 'web-token',
        [REFRESH_COOKIE_NAMES.ADMIN]: 'admin-token',
      },
    });
    expect(readRefreshCookie(request, 'WEB')).toBe('web-token');
    expect(readRefreshCookie(request, 'ADMIN')).toBe('admin-token');
    expect(
      readRefreshCookie(
        fakeRequest({ cookies: { onulsai_rt_admin: 'a' } }),
        'WEB',
      ),
    ).toBeUndefined();
    expect(readRefreshCookie(fakeRequest(), 'WEB')).toBeUndefined();
    expect(readAllRefreshCookies(request)).toEqual({
      WEB: 'web-token',
      ADMIN: 'admin-token',
    });
    expect(
      readAllRefreshCookies(fakeRequest({ cookies: { onulsai_rt_web: '' } })),
    ).toEqual({});
  });
});
