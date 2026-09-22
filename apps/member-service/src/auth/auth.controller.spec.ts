import { vi } from 'vitest';
import { fakeRequest, fakeResponse } from '../testing/fakes.js';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';

const cookieEnv = { COOKIE_SECURE: true, REFRESH_TTL: 2_592_000 };
const response = {
  accessToken: 'jwt',
  expiresIn: 900,
  member: {
    id: '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01',
    email: 'me@example.com',
    name: '홍길동',
    gender: 'MALE' as const,
    birthYear: 1990,
    phone: '01012345678',
    role: 'MEMBER' as const,
    status: 'ACTIVE' as const,
    marketingConsent: false,
    createdAt: '2026-09-22T10:00:00.000Z',
  },
};
const user = { id: response.member.id, role: 'MEMBER' as const };

function build() {
  const auth = {
    login: vi.fn(async () => ({ response, refreshToken: 'rt-new' })),
    refresh: vi.fn(async () => ({ response })),
    logout: vi.fn(async () => undefined),
    logoutAll: vi.fn(async () => ({ clearClients: ['ADMIN' as const] })),
    changePassword: vi.fn(async () => undefined),
  };
  const controller = new AuthController(
    auth as unknown as AuthService,
    cookieEnv,
  );
  return { controller, auth };
}

const bothCookies = { onulsai_rt_web: 'web-rt', onulsai_rt_admin: 'admin-rt' };

describe('AuthController', () => {
  it("login: passes Origin, pathname, request id and only the client's cookie; sets that client's cookie", async () => {
    const { controller, auth } = build();
    const req = fakeRequest({
      method: 'POST',
      url: '/api/v1/auth/login?x=1',
      headers: { origin: 'http://localhost:3001', 'x-request-id': 'req-9' },
      cookies: bothCookies,
    });
    const res = fakeResponse();

    const body = await controller.login(
      { email: 'me@example.com', password: 'pw', client: 'ADMIN' },
      req,
      res.res,
    );

    expect(body).toBe(response);
    expect(auth.login).toHaveBeenCalledWith(
      { email: 'me@example.com', password: 'pw', client: 'ADMIN' },
      {
        origin: 'http://localhost:3001',
        path: '/api/v1/auth/login',
        requestId: 'req-9',
        presentedToken: 'admin-rt',
      },
    );
    expect(res.cookies).toEqual([
      expect.objectContaining({
        name: 'onulsai_rt_admin',
        value: 'rt-new',
        options: expect.objectContaining({
          sameSite: 'strict',
          httpOnly: true,
          path: '/api/v1/auth',
        }),
      }),
    ]);
  });

  it('refresh: sets no cookie on a grace response and the WEB cookie on rotation', async () => {
    const { controller, auth } = build();
    const req = fakeRequest({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: bothCookies,
    });

    const grace = fakeResponse();
    await controller.refresh({ client: 'WEB' }, req, grace.res);
    expect(grace.cookies).toEqual([]);
    expect(auth.refresh).toHaveBeenCalledWith(
      { client: 'WEB' },
      expect.objectContaining({ presentedToken: 'web-rt' }),
    );

    auth.refresh.mockResolvedValueOnce({
      response,
      refreshToken: 'rt-rotated',
    } as never);
    const rotated = fakeResponse();
    await controller.refresh({ client: 'WEB' }, req, rotated.res);
    expect(rotated.cookies[0]).toMatchObject({
      name: 'onulsai_rt_web',
      value: 'rt-rotated',
    });
  });

  it('logout: always clears the client cookie (Max-Age=0), even when nothing was revoked', async () => {
    const { controller } = build();
    const res = fakeResponse();
    await controller.logout(
      { client: 'WEB' },
      fakeRequest({ url: '/api/v1/auth/logout' }),
      res.res,
    );
    expect(res.cookies).toEqual([
      expect.objectContaining({
        name: 'onulsai_rt_web',
        value: '',
        options: expect.objectContaining({ maxAge: 0 }),
      }),
    ]);
  });

  it('logout-all and password change hand both cookies to the service; logout-all clears the returned ones', async () => {
    const { controller, auth } = build();
    const req = fakeRequest({
      url: '/api/v1/auth/logout-all',
      headers: { 'x-request-id': 'r1' },
      cookies: bothCookies,
    });
    const res = fakeResponse();

    await controller.logoutAll(user, req, res.res);
    expect(auth.logoutAll).toHaveBeenCalledWith(user, {
      presentedTokens: { WEB: 'web-rt', ADMIN: 'admin-rt' },
      requestId: 'r1',
    });
    expect(res.cookies.map((cookie) => cookie.name)).toEqual([
      'onulsai_rt_admin',
    ]);

    await controller.changePassword(
      user,
      { currentPassword: 'a', newPassword: 'b'.repeat(8) },
      req,
    );
    expect(auth.changePassword).toHaveBeenCalledWith(
      user,
      { currentPassword: 'a', newPassword: 'b'.repeat(8) },
      {
        presentedTokens: { WEB: 'web-rt', ADMIN: 'admin-rt' },
        requestId: 'r1',
      },
    );
  });
});
