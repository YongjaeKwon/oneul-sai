import {
  API_ERROR_CODES,
  type ApiErrorResponse,
  type MemberDetail,
  type MemberListResponse,
  type MemberProfile,
} from '@oneul-sai/contracts';
import { WITHDRAWN_PASSWORD_HASH } from '../auth/auth.constants.js';
import { ensureAdmin } from '../seed/ensure-admin.js';
import {
  cookieNames,
  signupInput,
  TEST_PASSWORD,
  TestApp,
  type ApiResult,
} from '../testing/integration-app.js';

// SPEC-001 13절 통합: 동시 가입 · 탈퇴 익명화 · 휴대폰 변경 · 비밀번호 변경 · 모든 기기 로그아웃 · 정지 · 운영자 API.

let t: TestApp;

beforeAll(async () => {
  t = await TestApp.start();
});
beforeEach(() => t.truncate());
afterAll(async () => {
  await t.truncate();
  await t.close();
});

const codeOf = (result: ApiResult): string | undefined =>
  (result.body as ApiErrorResponse).code;

async function createAdmin(): Promise<{ id: string; role: 'ADMIN' }> {
  const admin = await ensureAdmin(t.prisma, {
    email: 'admin@example.com',
    name: '운영자',
    password: TEST_PASSWORD,
    resetPassword: false,
  });
  return { id: admin.memberId, role: 'ADMIN' };
}

describe('members (integration)', () => {
  it('lets exactly one of 10 concurrent signups with the same email through (unique email)', async () => {
    const input = signupInput({ email: 'race@example.com' });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        t.call({ method: 'POST', path: '/api/v1/members', body: input }),
      ),
    );
    const statuses = results.map((result) => result.status).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(9);
    for (const result of results.filter((r) => r.status === 409)) {
      expect(codeOf(result)).toBe(API_ERROR_CODES.EMAIL_ALREADY_EXISTS);
      expect((result.body as ApiErrorResponse).message).not.toContain('race@');
    }
    expect(await t.prisma.member.count()).toBe(1);
  });

  it('rejects underage, missing consent and unknown fields with the spec codes', async () => {
    const year = new Date().getFullYear();
    const young = await t.call({
      method: 'POST',
      path: '/api/v1/members',
      body: signupInput({ birthYear: year - 18 }),
    });
    expect(young.status).toBe(400);
    expect(codeOf(young)).toBe(API_ERROR_CODES.AGE_NOT_ALLOWED);

    const noConsent = await t.call({
      method: 'POST',
      path: '/api/v1/members',
      body: signupInput({ consents: { privacy: false, marketing: true } }),
    });
    expect(noConsent.status).toBe(400);
    expect(codeOf(noConsent)).toBe(API_ERROR_CODES.CONSENT_REQUIRED);

    const withRole = await t.call({
      method: 'POST',
      path: '/api/v1/members',
      body: { ...signupInput(), role: 'ADMIN' },
    });
    expect(withRole.status).toBe(400);
    expect(codeOf(withRole)).toBe(API_ERROR_CODES.VALIDATION_FAILED);

    const oldEnough = await t.call({
      method: 'POST',
      path: '/api/v1/members',
      body: signupInput({ birthYear: year - 19, phone: '011 123 4567' }),
    });
    expect(oldEnough.status).toBe(201);
    expect((oldEnough.body as MemberProfile).phone).toBe('0111234567');
  });

  it('withdraw anonymizes immediately, deletes tokens, clears both cookies and frees the email', async () => {
    const { input, profile } = await t.signup({
      consents: { privacy: true, marketing: true },
    });
    const login = await t.login(input.email, input.password, 'WEB');
    const claims = await t.verifyAccessToken(t.authOf(login).accessToken);
    const user = { id: profile.id, role: 'MEMBER' as const };

    const withdraw = await t.call({
      method: 'DELETE',
      path: '/api/v1/members/me',
      body: { password: input.password },
      user,
    });
    expect(withdraw.status).toBe(204);
    expect(withdraw.cookies[cookieNames.WEB]).toMatchObject({
      maxAge: 0,
      path: '/api/v1/auth',
    });
    expect(withdraw.cookies[cookieNames.ADMIN]).toMatchObject({
      maxAge: 0,
      path: '/api/v1/auth',
    });

    const row = await t.prisma.member.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(row).toMatchObject({
      status: 'WITHDRAWN',
      email: `withdrawn+${profile.id}@invalid`,
      name: null,
      gender: null,
      birthYear: null,
      phone: null,
      passwordHash: WITHDRAWN_PASSWORD_HASH,
      failedLoginCount: 0,
      lastFailedLoginAt: null,
      marketingAgreedAt: null,
    });
    expect(row.withdrawnAt).not.toBeNull();
    expect(row.marketingWithdrawnAt).not.toBeNull();
    expect(row.privacyAgreedAt).not.toBeNull();
    expect(
      await t.prisma.refreshToken.count({ where: { memberId: profile.id } }),
    ).toBe(0);

    // 탈퇴 전 access token(Gateway는 통과시킨다)으로 me → 401
    const me = await t.call({
      method: 'GET',
      path: '/api/v1/members/me',
      user: { id: String(claims.sub), role: 'MEMBER' },
    });
    expect(me.status).toBe(401);
    expect(codeOf(me)).toBe(API_ERROR_CODES.UNAUTHENTICATED);

    // 같은 이메일로 재가입은 새 회원
    const again = await t.signup({
      email: input.email,
      password: 'brand-new-password',
    });
    expect(again.profile.id).not.toBe(profile.id);
    const oldLogin = await t.login(input.email, input.password, 'WEB');
    expect(oldLogin.status).toBe(401);
    expect(codeOf(oldLogin)).toBe(API_ERROR_CODES.INVALID_CREDENTIALS);
  });

  it('phone change requires the current password; marketing consent toggles without it and is idempotent', async () => {
    const { input, profile } = await t.signup();
    const user = { id: profile.id, role: 'MEMBER' as const };

    const missing = await t.call({
      method: 'PATCH',
      path: '/api/v1/members/me',
      body: { phone: '010-2222-3333' },
      user,
    });
    expect(missing.status).toBe(400);
    expect(codeOf(missing)).toBe(API_ERROR_CODES.VALIDATION_FAILED);

    const wrong = await t.call({
      method: 'PATCH',
      path: '/api/v1/members/me',
      body: { phone: '010-2222-3333', currentPassword: 'wrong-password' },
      user,
    });
    expect(wrong.status).toBe(401);
    const afterWrong = await t.prisma.member.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(afterWrong.failedLoginCount).toBe(1);

    const ok = await t.call({
      method: 'PATCH',
      path: '/api/v1/members/me',
      body: { phone: '010-2222-3333', currentPassword: input.password },
      user,
    });
    expect(ok.status).toBe(200);
    expect((ok.body as MemberProfile).phone).toBe('01022223333');
    const afterOk = await t.prisma.member.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(afterOk).toMatchObject({
      phone: '01022223333',
      failedLoginCount: 0,
    });

    const consent = await t.call({
      method: 'PATCH',
      path: '/api/v1/members/me',
      body: { marketingConsent: true },
      user,
    });
    expect(consent.status).toBe(200);
    expect((consent.body as MemberProfile).marketingConsent).toBe(true);
    const agreedAt = (
      await t.prisma.member.findUniqueOrThrow({ where: { id: profile.id } })
    ).marketingAgreedAt;
    expect(agreedAt).not.toBeNull();

    await t.call({
      method: 'PATCH',
      path: '/api/v1/members/me',
      body: { marketingConsent: true },
      user,
    });
    const stillAgreed = await t.prisma.member.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(stillAgreed.marketingAgreedAt?.getTime()).toBe(agreedAt?.getTime());

    const revoke = await t.call({
      method: 'PATCH',
      path: '/api/v1/members/me',
      body: { marketingConsent: false },
      user,
    });
    expect((revoke.body as MemberProfile).marketingConsent).toBe(false);
    const withdrawn = await t.prisma.member.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(withdrawn.marketingAgreedAt).toBeNull();
    expect(withdrawn.marketingWithdrawnAt).not.toBeNull();

    const withName = await t.call({
      method: 'PATCH',
      path: '/api/v1/members/me',
      body: { name: '다른이름' },
      user,
    });
    expect(withName.status).toBe(400);
  });

  it('password change keeps the presenting family and revokes the others', async () => {
    const { input, profile } = await t.signup();
    const user = { id: profile.id, role: 'MEMBER' as const };
    const loginA = await t.login(input.email, input.password, 'WEB');
    const loginB = await t.login(input.email, input.password, 'WEB');
    const rtA = t.cookieOf(loginA, 'WEB');
    const rtB = t.cookieOf(loginB, 'WEB');

    const change = await t.call({
      method: 'POST',
      path: '/api/v1/auth/password',
      body: {
        currentPassword: input.password,
        newPassword: 'new-password-123',
      },
      user,
      cookies: { [cookieNames.WEB]: rtA },
    });
    expect(change.status).toBe(204);
    expect(Object.keys(change.cookies)).toHaveLength(0);

    const refreshB = await t.refresh('WEB', { [cookieNames.WEB]: rtB });
    expect(refreshB.status).toBe(401);
    expect(codeOf(refreshB)).toBe(API_ERROR_CODES.INVALID_REFRESH_TOKEN);
    const refreshA = await t.refresh('WEB', { [cookieNames.WEB]: rtA });
    expect(refreshA.status).toBe(200);

    const oldPassword = await t.login(input.email, input.password, 'WEB');
    expect(oldPassword.status).toBe(401);
    const newPassword = await t.login(input.email, 'new-password-123', 'WEB');
    expect(newPassword.status).toBe(200);

    const short = await t.call({
      method: 'POST',
      path: '/api/v1/auth/password',
      body: { currentPassword: 'new-password-123', newPassword: 'short' },
      user,
    });
    expect(short.status).toBe(400);
    expect(codeOf(short)).toBe(API_ERROR_CODES.VALIDATION_FAILED);
  });

  it('logout-all revokes every family and clears the presented cookie of this member', async () => {
    const { input, profile } = await t.signup();
    const user = { id: profile.id, role: 'MEMBER' as const };
    const tokens = [];
    for (let i = 0; i < 3; i += 1) {
      tokens.push(
        t.cookieOf(await t.login(input.email, input.password, 'WEB'), 'WEB'),
      );
    }

    const logoutAll = await t.call({
      method: 'POST',
      path: '/api/v1/auth/logout-all',
      user,
      cookies: { [cookieNames.WEB]: tokens[0] },
    });
    expect(logoutAll.status).toBe(204);
    expect(logoutAll.cookies[cookieNames.WEB]).toMatchObject({ maxAge: 0 });
    expect(logoutAll.cookies[cookieNames.ADMIN]).toBeUndefined();

    for (const token of tokens) {
      const refresh = await t.refresh('WEB', { [cookieNames.WEB]: token });
      expect(refresh.status).toBe(401);
    }
    const again = await t.call({
      method: 'POST',
      path: '/api/v1/auth/logout-all',
      user,
    });
    expect(again.status).toBe(204);
  });

  it('suspension blocks refresh and member APIs until an admin lifts it', async () => {
    const admin = await createAdmin();
    const { input, profile } = await t.signup();
    const user = { id: profile.id, role: 'MEMBER' as const };
    const login = await t.login(input.email, input.password, 'WEB');
    const rt = t.cookieOf(login, 'WEB');

    const suspend = await t.call({
      method: 'PATCH',
      path: `/api/v1/members/${profile.id}/status`,
      body: { status: 'SUSPENDED', reason: '운영 정책 위반' },
      user: admin,
    });
    expect(suspend.status).toBe(200);
    expect(suspend.body).toMatchObject({
      status: 'SUSPENDED',
      statusReason: '운영 정책 위반',
    });

    const refresh = await t.refresh('WEB', { [cookieNames.WEB]: rt });
    expect(refresh.status).toBe(403);
    expect(codeOf(refresh)).toBe(API_ERROR_CODES.ACCOUNT_SUSPENDED);
    const me = await t.call({
      method: 'GET',
      path: '/api/v1/members/me',
      user,
    });
    expect(me.status).toBe(403);
    const relogin = await t.login(input.email, input.password, 'WEB');
    expect(relogin.status).toBe(403);
    expect(codeOf(relogin)).toBe(API_ERROR_CODES.ACCOUNT_SUSPENDED);

    const lift = await t.call({
      method: 'PATCH',
      path: `/api/v1/members/${profile.id}/status`,
      body: { status: 'ACTIVE' },
      user: admin,
    });
    expect(lift.status).toBe(200);
    const back = await t.login(input.email, input.password, 'WEB');
    expect(back.status).toBe(200);

    const self = await t.call({
      method: 'PATCH',
      path: `/api/v1/members/${admin.id}/status`,
      body: { status: 'SUSPENDED', reason: 'x' },
      user: admin,
    });
    expect(self.status).toBe(400);
    expect(codeOf(self)).toBe(API_ERROR_CODES.SELF_STATUS_CHANGE);
  });

  it('admin list/detail: role check, search, withdrawn detail is anonymized, 404 and 400 on bad ids', async () => {
    const admin = await createAdmin();
    const a = await t.signup({
      email: 'alice@example.com',
      name: '앨리스',
      phone: '010-1111-2222',
    });
    const b = await t.signup({
      email: 'bob@example.com',
      name: '밥',
      phone: '010-3333-4444',
    });

    const forbidden = await t.call({
      method: 'GET',
      path: '/api/v1/members',
      user: { id: a.profile.id, role: 'MEMBER' },
    });
    expect(forbidden.status).toBe(403);
    expect(codeOf(forbidden)).toBe(API_ERROR_CODES.FORBIDDEN);

    const all = await t.call({
      method: 'GET',
      path: '/api/v1/members',
      user: admin,
    });
    expect(all.status).toBe(200);
    const list = all.body as MemberListResponse;
    expect(list.total).toBe(3);
    expect(list.items.map((item) => item.email)).toEqual([
      'bob@example.com',
      'alice@example.com',
      'admin@example.com',
    ]);
    expect(list.items[0]).not.toHaveProperty('passwordHash');

    const byPhone = await t.call({
      method: 'GET',
      path: '/api/v1/members?query=010-3333&status=ACTIVE&role=MEMBER',
      user: admin,
    });
    expect(
      (byPhone.body as MemberListResponse).items.map((item) => item.id),
    ).toEqual([b.profile.id]);
    const byName = await t.call({
      method: 'GET',
      path: `/api/v1/members?query=${encodeURIComponent('앨리')}&pageSize=1`,
      user: admin,
    });
    expect(
      (byName.body as MemberListResponse).items.map((item) => item.id),
    ).toEqual([a.profile.id]);

    const detail = await t.call({
      method: 'GET',
      path: `/api/v1/members/${a.profile.id}`,
      user: admin,
    });
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: a.profile.id,
      failedLoginCount: 0,
      lastFailedLoginAt: null,
      statusReason: null,
    });
    expect(detail.body).not.toHaveProperty('passwordHash');

    await t.call({
      method: 'DELETE',
      path: '/api/v1/members/me',
      body: { password: b.input.password },
      user: { id: b.profile.id, role: 'MEMBER' },
    });
    const withdrawn = await t.call({
      method: 'GET',
      path: `/api/v1/members/${b.profile.id}`,
      user: admin,
    });
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body as MemberDetail).toMatchObject({
      status: 'WITHDRAWN',
      name: null,
      phone: null,
      email: `withdrawn+${b.profile.id}@invalid`,
    });
    const suspendWithdrawn = await t.call({
      method: 'PATCH',
      path: `/api/v1/members/${b.profile.id}/status`,
      body: { status: 'SUSPENDED', reason: 'x' },
      user: admin,
    });
    expect(suspendWithdrawn.status).toBe(409);
    expect(codeOf(suspendWithdrawn)).toBe(
      API_ERROR_CODES.INVALID_STATUS_TRANSITION,
    );

    const missing = await t.call({
      method: 'GET',
      path: '/api/v1/members/00000000-0000-4000-8000-000000000000',
      user: admin,
    });
    expect(missing.status).toBe(404);
    expect(codeOf(missing)).toBe(API_ERROR_CODES.MEMBER_NOT_FOUND);

    const badId = await t.call({
      method: 'GET',
      path: '/api/v1/members/not-a-uuid',
      user: admin,
    });
    expect(badId.status).toBe(400);
    expect((badId.body as ApiErrorResponse).path).toBe(
      '/api/v1/members/not-a-uuid',
    );

    const badQuery = await t.call({
      method: 'GET',
      path: '/api/v1/members?query=010&pageSize=1000',
      user: admin,
    });
    expect(badQuery.status).toBe(400);
    expect((badQuery.body as ApiErrorResponse).path).toBe('/api/v1/members');
    expect((badQuery.body as ApiErrorResponse).message).not.toContain('1000');
  });

  it('admin list by ids: only those rows, AND with other filters, missing ids dropped, access log names the returned ids (SPEC-003 D11)', async () => {
    const admin = await createAdmin();
    const a = await t.signup({
      email: 'alice@example.com',
      name: '앨리스',
      phone: '010-1111-2222',
    });
    const b = await t.signup({
      email: 'bob@example.com',
      name: '밥',
      phone: '010-3333-4444',
    });
    await t.signup({ email: 'carol@example.com', name: '캐럴' });
    const missing = '00000000-0000-4000-8000-000000000000';

    const logs: string[] = [];
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        logs.push(String(chunk));
        return true;
      });
    let byIds: ApiResult;
    try {
      byIds = await t.call({
        method: 'GET',
        path: `/api/v1/members?ids=${a.profile.id},${b.profile.id},${missing}&pageSize=100`,
        user: admin,
      });
    } finally {
      write.mockRestore();
    }
    expect(byIds.status).toBe(200);
    expect(
      (byIds.body as MemberListResponse).items.map((item) => item.id).sort(),
    ).toEqual([a.profile.id, b.profile.id].sort());

    const viewed = logs
      .flatMap((chunk) => chunk.split('\n'))
      .filter((line) => line.includes('"member.list_viewed"'));
    expect(viewed).toHaveLength(1);
    const entry = JSON.parse(viewed[0] ?? '{}') as Record<string, unknown>;
    expect(entry).toMatchObject({
      adminId: admin.id,
      hasFilter: true,
      count: 2,
    });
    expect((entry['memberIds'] as string[]).sort()).toEqual(
      [a.profile.id, b.profile.id].sort(),
    );
    expect(viewed[0]).not.toContain(missing);
    expect(viewed[0]).not.toContain('010');
    expect(viewed[0]).not.toContain('앨리스');

    const andStatus = await t.call({
      method: 'GET',
      path: `/api/v1/members?ids=${a.profile.id},${b.profile.id}&query=${encodeURIComponent('밥')}`,
      user: admin,
    });
    expect(
      (andStatus.body as MemberListResponse).items.map((item) => item.id),
    ).toEqual([b.profile.id]);

    const tooMany = await t.call({
      method: 'GET',
      path: `/api/v1/members?ids=${Array.from({ length: 101 }, () => a.profile.id).join(',')}&pageSize=100`,
      user: admin,
    });
    expect(tooMany.status).toBe(400);
    expect(codeOf(tooMany)).toBe(API_ERROR_CODES.VALIDATION_FAILED);

    const overPageSize = await t.call({
      method: 'GET',
      path: `/api/v1/members?ids=${a.profile.id},${b.profile.id}&pageSize=1`,
      user: admin,
    });
    expect(overPageSize.status).toBe(400);

    const notUuid = await t.call({
      method: 'GET',
      path: `/api/v1/members?ids=${a.profile.id},not-a-uuid`,
      user: admin,
    });
    expect(notUuid.status).toBe(400);
    expect((notUuid.body as ApiErrorResponse).message).not.toContain(
      'not-a-uuid',
    );
  });
});
