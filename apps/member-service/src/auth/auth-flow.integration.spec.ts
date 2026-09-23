import { env } from '../env.js';
import { API_ERROR_CODES, type ApiErrorResponse } from '@oneul-sai/contracts';
import { ensureAdmin } from '../seed/ensure-admin.js';
import {
  cookieNames,
  TEST_PASSWORD,
  TestApp,
  type ApiResult,
} from '../testing/integration-app.js';
import { hashRefreshToken } from '../tokens/token.service.js';

// SPEC-001 13절 통합: 10절 흐름 전체 · 3탭 동시 부팅 · 클라이언트 경계(R1).

let t: TestApp;

beforeAll(async () => {
  t = await TestApp.start();
});
beforeEach(() => t.truncate());
afterAll(async () => {
  await t.truncate();
  await t.close();
});

const errorOf = (result: ApiResult): ApiErrorResponse =>
  result.body as ApiErrorResponse;

describe('auth flow (integration)', () => {
  it('signup → login → me → refresh rotation → grace → reuse detection → relogin → logout', async () => {
    const { profile, input } = await t.signup({ email: 'Flow@Example.com ' });
    expect(profile.email).toBe('flow@example.com');
    expect(profile.phone).toBe('01012345678');
    expect(profile).not.toHaveProperty('passwordHash');

    const login = await t.login(input.email, input.password, 'WEB');
    expect(login.status).toBe(200);
    const auth = t.authOf(login);
    expect(auth.expiresIn).toBe(env.JWT_ACCESS_TTL);
    expect(auth).not.toHaveProperty('refreshToken');
    expect(auth.member.id).toBe(profile.id);

    const webCookie = login.cookies[cookieNames.WEB];
    expect(webCookie).toMatchObject({
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      path: '/api/v1/auth',
      sameSite: 'Lax',
      maxAge: env.REFRESH_TTL,
    });
    const rt1 = t.cookieOf(login, 'WEB');
    expect(rt1).toHaveLength(43);

    const claims = await t.verifyAccessToken(auth.accessToken);
    expect(claims.sub).toBe(profile.id);
    expect(claims.role).toBe('MEMBER');
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(env.JWT_ACCESS_TTL);

    const me = await t.call({
      method: 'GET',
      path: '/api/v1/members/me',
      user: { id: profile.id, role: 'MEMBER' },
    });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      id: profile.id,
      email: 'flow@example.com',
    });

    // 회전
    const r1 = await t.refresh('WEB', { [cookieNames.WEB]: rt1 });
    expect(r1.status).toBe(200);
    const rt2 = t.cookieOf(r1, 'WEB');
    expect(rt2).not.toBe(rt1);
    const rows = await t.prisma.refreshToken.findMany({
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((row) => row.status)).toEqual(['ROTATED', 'ACTIVE']);
    expect(rows[0]?.familyId).toBe(rows[1]?.familyId);
    expect(rows[0]?.rotatedAt).not.toBeNull();

    // 유예 창 안의 재제시: access token만, Set-Cookie 없음
    const grace = await t.refresh('WEB', { [cookieNames.WEB]: rt1 });
    expect(grace.status).toBe(200);
    expect(Object.keys(grace.cookies)).toHaveLength(0);
    expect(t.authOf(grace).accessToken).toEqual(expect.any(String));

    // 유예 창 밖: 재사용 탐지 → 가족 폐기
    await t.prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(rt1) },
      data: { rotatedAt: new Date(Date.now() - 61_000) },
    });
    const reuse = await t.refresh('WEB', { [cookieNames.WEB]: rt1 });
    expect(reuse.status).toBe(401);
    expect(errorOf(reuse).code).toBe(API_ERROR_CODES.REFRESH_TOKEN_REUSED);
    const rt2Row = await t.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rt2) },
    });
    expect(rt2Row).toMatchObject({ status: 'REVOKED', revokedReason: 'REUSE' });

    const afterReuse = await t.refresh('WEB', { [cookieNames.WEB]: rt2 });
    expect(afterReuse.status).toBe(401);
    expect(errorOf(afterReuse).code).toBe(API_ERROR_CODES.REFRESH_TOKEN_REUSED);

    // 재로그인 → 로그아웃 → 같은 토큰 refresh 401 INVALID_REFRESH_TOKEN
    const relogin = await t.login(input.email, input.password, 'WEB');
    expect(relogin.status).toBe(200);
    const rt3 = t.cookieOf(relogin, 'WEB');

    const logout = await t.call({
      method: 'POST',
      path: '/api/v1/auth/logout',
      body: { client: 'WEB' },
      cookies: { [cookieNames.WEB]: rt3 },
    });
    expect(logout.status).toBe(204);
    expect(logout.cookies[cookieNames.WEB]).toMatchObject({
      value: '',
      maxAge: 0,
      path: '/api/v1/auth',
    });

    const afterLogout = await t.refresh('WEB', { [cookieNames.WEB]: rt3 });
    expect(afterLogout.status).toBe(401);
    expect(errorOf(afterLogout).code).toBe(
      API_ERROR_CODES.INVALID_REFRESH_TOKEN,
    );
  });

  it('three tabs booting at once: all 200, exactly one Set-Cookie, family stays ACTIVE', async () => {
    const { input } = await t.signup();
    const login = await t.login(input.email, input.password, 'WEB');
    const rt = t.cookieOf(login, 'WEB');

    const results = await Promise.all([
      t.refresh('WEB', { [cookieNames.WEB]: rt }),
      t.refresh('WEB', { [cookieNames.WEB]: rt }),
      t.refresh('WEB', { [cookieNames.WEB]: rt }),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200, 200]);
    const withCookie = results.filter(
      (result) => result.cookies[cookieNames.WEB] !== undefined,
    );
    expect(withCookie).toHaveLength(1);

    const next = t.cookieOf(withCookie[0]!, 'WEB');
    const again = await t.refresh('WEB', { [cookieNames.WEB]: next });
    expect(again.status).toBe(200);
    const active = await t.prisma.refreshToken.count({
      where: { status: 'ACTIVE' },
    });
    expect(active).toBe(1);
  });

  it('web and admin cookies coexist; the body client decides which cookie is read (R1)', async () => {
    const { input, profile } = await t.signup();
    await ensureAdmin(t.prisma, {
      email: 'admin@example.com',
      name: '운영자',
      password: TEST_PASSWORD,
      resetPassword: false,
    });

    const webLogin = await t.login(input.email, input.password, 'WEB');
    const adminLogin = await t.login(
      'admin@example.com',
      TEST_PASSWORD,
      'ADMIN',
    );
    expect(adminLogin.status).toBe(200);
    expect(adminLogin.cookies[cookieNames.ADMIN]).toMatchObject({
      sameSite: 'Strict',
      httpOnly: true,
      path: '/api/v1/auth',
    });
    expect(t.authOf(adminLogin).member).toMatchObject({
      role: 'ADMIN',
      gender: null,
      birthYear: null,
      phone: null,
    });
    const webRt = t.cookieOf(webLogin, 'WEB');
    const adminRt = t.cookieOf(adminLogin, 'ADMIN');
    const both = { [cookieNames.WEB]: webRt, [cookieNames.ADMIN]: adminRt };

    // client: WEB → web 토큰만 회전, admin 행 불변
    const webRefresh = await t.refresh('WEB', both);
    expect(webRefresh.status).toBe(200);
    expect(webRefresh.cookies[cookieNames.ADMIN]).toBeUndefined();
    const adminRow = await t.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(adminRt) },
    });
    expect(adminRow?.status).toBe('ACTIVE');

    // client: ADMIN + admin Origin → admin 토큰만 회전, web 행(방금 회전된 새 것) 불변
    const newWebRt = t.cookieOf(webRefresh, 'WEB');
    const adminRefresh = await t.refresh('ADMIN', {
      [cookieNames.WEB]: newWebRt,
      [cookieNames.ADMIN]: adminRt,
    });
    expect(adminRefresh.status).toBe(200);
    expect(adminRefresh.cookies[cookieNames.WEB]).toBeUndefined();
    const newWebRow = await t.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(newWebRt) },
    });
    expect(newWebRow?.status).toBe('ACTIVE');
    const newAdminRt = t.cookieOf(adminRefresh, 'ADMIN');

    // web Origin에서 client: ADMIN → 403
    const wrongOrigin = await t.refresh(
      'ADMIN',
      { [cookieNames.ADMIN]: newAdminRt },
      { origin: 'http://localhost:3000' },
    );
    expect(wrongOrigin.status).toBe(403);
    expect(errorOf(wrongOrigin).code).toBe(API_ERROR_CODES.ORIGIN_NOT_ALLOWED);

    // admin Origin + client: ADMIN인데 web 쿠키만 → 400
    const missingCookie = await t.refresh('ADMIN', {
      [cookieNames.WEB]: newWebRt,
    });
    expect(missingCookie.status).toBe(400);
    expect(errorOf(missingCookie).code).toBe(API_ERROR_CODES.VALIDATION_FAILED);

    // web 토큰 값을 admin 쿠키에 넣고 client: ADMIN → 401 (행의 client 불일치)
    const swapped = await t.refresh('ADMIN', { [cookieNames.ADMIN]: newWebRt });
    expect(swapped.status).toBe(401);
    expect(errorOf(swapped).code).toBe(API_ERROR_CODES.INVALID_REFRESH_TOKEN);

    // client: WEB logout 뒤 admin refresh 정상
    const logout = await t.call({
      method: 'POST',
      path: '/api/v1/auth/logout',
      body: { client: 'WEB' },
      cookies: { [cookieNames.WEB]: newWebRt, [cookieNames.ADMIN]: newAdminRt },
    });
    expect(logout.status).toBe(204);
    expect(logout.cookies[cookieNames.ADMIN]).toBeUndefined();
    const adminStill = await t.refresh('ADMIN', {
      [cookieNames.ADMIN]: newAdminRt,
    });
    expect(adminStill.status).toBe(200);

    // MEMBER가 client: ADMIN으로 로그인 → 403 ROLE_NOT_ALLOWED, 토큰 없음
    const memberAsAdmin = await t.login(input.email, input.password, 'ADMIN');
    expect(memberAsAdmin.status).toBe(403);
    expect(errorOf(memberAsAdmin).code).toBe(API_ERROR_CODES.ROLE_NOT_ALLOWED);
    expect(Object.keys(memberAsAdmin.cookies)).toHaveLength(0);
    const memberTokens = await t.prisma.refreshToken.count({
      where: { memberId: profile.id, client: 'ADMIN' },
    });
    expect(memberTokens).toBe(0);
  });

  it('login with a valid same-client cookie revokes that family (RELOGIN) and caps ACTIVE families at 10', async () => {
    const { input, profile } = await t.signup();
    const first = await t.login(input.email, input.password, 'WEB');
    const rt = t.cookieOf(first, 'WEB');

    const second = await t.login(input.email, input.password, 'WEB', {
      cookies: { [cookieNames.WEB]: rt },
    });
    expect(second.status).toBe(200);
    const firstRow = await t.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rt) },
    });
    expect(firstRow).toMatchObject({
      status: 'REVOKED',
      revokedReason: 'RELOGIN',
    });

    for (let i = 0; i < 10; i += 1) {
      await t.login(input.email, input.password, 'WEB');
    }
    const families = await t.prisma.refreshToken.groupBy({
      by: ['familyId'],
      where: { memberId: profile.id, status: 'ACTIVE' },
    });
    expect(families).toHaveLength(10);
    const limited = await t.prisma.refreshToken.count({
      where: { memberId: profile.id, revokedReason: 'LIMIT' },
    });
    expect(limited).toBe(1);
  });

  it('rejects the service port without the internal token, except /health', async () => {
    const noToken = await t.call({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: 'a@b.co', password: 'x', client: 'WEB' },
      internalToken: null,
    });
    expect(noToken.status).toBe(401);
    expect(errorOf(noToken).code).toBe(API_ERROR_CODES.INTERNAL_TOKEN_INVALID);

    const wrongToken = await t.call({
      method: 'GET',
      path: '/api/v1/members/me',
      internalToken: 'x'.repeat(40),
    });
    expect(wrongToken.status).toBe(401);

    // Express 5 라우팅은 대소문자를 구분하지 않는다 — 대문자 경로도 내부 토큰을 검사한다 (SPEC-002 D10).
    const upperCase = await t.call({
      method: 'GET',
      path: '/API/V1/members/me',
      internalToken: null,
    });
    expect(upperCase.status).toBe(401);
    expect(errorOf(upperCase).code).toBe(
      API_ERROR_CODES.INTERNAL_TOKEN_INVALID,
    );

    const health = await t.call({
      method: 'GET',
      path: '/health',
      internalToken: null,
    });
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('refuses a non-JSON login body (login CSRF) without setting a cookie', async () => {
    const { input } = await t.signup();
    const form = await t.call({
      method: 'POST',
      path: '/api/v1/auth/login',
      rawBody: `email=${input.email}&password=${input.password}&client=WEB`,
      contentType: 'application/x-www-form-urlencoded',
    });
    expect(form.status).toBe(400);
    expect(errorOf(form).code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    expect(errorOf(form).message).toBe('content-type: application/json');
    expect(Object.keys(form.cookies)).toHaveLength(0);
  });
});
