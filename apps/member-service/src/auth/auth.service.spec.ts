import { API_ERROR_CODES } from '@oneul-sai/contracts';
import type { ApiHttpException } from '@oneul-sai/service-kit';
import { vi } from 'vitest';
import type { RefreshToken } from '../generated/prisma/client.js';
import type { MemberWithSecret } from '../members/member-select.js';
import { fakeLogger } from '../testing/fakes.js';
import {
  decodeAccessSecret,
  hashRefreshToken,
  TokenService,
} from '../tokens/token.service.js';
import { INVALID_CREDENTIALS_MESSAGE } from './auth.constants.js';
import { AuthService, type PresentedTokenContext } from './auth.service.js';

const NOW = new Date('2026-09-22T10:00:00.000Z');
const MEMBER_ID = '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01';
const OTHER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const ADMIN_ORIGIN = 'http://localhost:3001';
const SECRET = Buffer.alloc(32, 3).toString('base64');

function member(overrides: Partial<MemberWithSecret> = {}): MemberWithSecret {
  return {
    id: MEMBER_ID,
    email: 'me@example.com',
    name: '홍길동',
    gender: 'MALE',
    birthYear: 1990,
    phone: '01012345678',
    role: 'MEMBER',
    status: 'ACTIVE',
    statusReason: null,
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    privacyAgreedAt: NOW,
    marketingAgreedAt: null,
    marketingWithdrawnAt: null,
    withdrawnAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    passwordHash: 'scrypt$stored',
    ...overrides,
  };
}

function tokenRow(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'row-1',
    memberId: MEMBER_ID,
    familyId: 'fam-1',
    familyStartedAt: new Date(NOW.getTime() - 60_000),
    client: 'WEB',
    tokenHash: hashRefreshToken('presented'),
    status: 'ACTIVE',
    expiresAt: new Date(NOW.getTime() + 60_000),
    rotatedAt: null,
    revokedAt: null,
    revokedReason: null,
    createdAt: NOW,
    ...overrides,
  };
}

interface BuildInput {
  member?: MemberWithSecret | null;
  row?: RefreshToken | null;
  familyActive?: boolean;
  verifyResult?: boolean;
}

function build(input: BuildInput = {}) {
  const found = input.member === undefined ? member() : input.member;
  const row = input.row ?? null;
  const logger = fakeLogger();
  const tx = {
    $queryRaw: vi.fn(async () => (row ? [{ id: row.id }] : [])),
    refreshToken: {
      findUnique: vi.fn(async () => row),
      findFirst: vi.fn(async () =>
        input.familyActive ? { id: 'active' } : null,
      ),
      findMany: vi.fn(async () => [{ familyId: 'fam-1' }]),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
      groupBy: vi.fn(async () => []),
    },
    member: {
      findUnique: vi.fn(async () => found),
      update: vi.fn(async () => ({})),
    },
  };
  const prisma = {
    member: { findUnique: vi.fn(async () => found) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const password = {
    verify: vi.fn(async () => input.verifyResult ?? true),
    verifyDummy: vi.fn(async () => false as const),
    hash: vi.fn(async () => 'scrypt$new'),
  };
  const backoff = {
    run: vi.fn(
      async (_id: string, _source: string, verify: () => Promise<boolean>) => {
        const ok = await verify();
        return { ok, failedLoginCount: ok ? 0 : 1 };
      },
    ),
    runUnknown: vi.fn(async (_email: string, dummy: () => Promise<false>) => {
      await dummy();
      return { ok: false, failedLoginCount: 0 };
    }),
  };
  const tokens = new TokenService({
    secret: decodeAccessSecret(SECRET),
    accessTtlSeconds: 900,
    refreshTtlSeconds: 2_592_000,
    now: () => NOW,
  });
  const service = new AuthService(
    prisma as never,
    password as never,
    backoff as never,
    tokens,
    { adminOrigin: ADMIN_ORIGIN, logger },
  );
  return { service, prisma, tx, password, backoff, logger };
}

const ctx = (
  overrides: Partial<PresentedTokenContext> = {},
): PresentedTokenContext => ({
  origin: undefined,
  path: '/api/v1/auth/login',
  requestId: 'req-1',
  presentedToken: undefined,
  ...overrides,
});

async function failure(promise: Promise<unknown>): Promise<ApiHttpException> {
  try {
    await promise;
  } catch (error) {
    return error as ApiHttpException;
  }
  throw new Error('expected rejection');
}

const webLogin = {
  email: 'me@example.com',
  password: 'pw',
  client: 'WEB' as const,
};
const adminLogin = { ...webLogin, client: 'ADMIN' as const };

describe('AuthService.login', () => {
  it('answers unknown email and wrong password with the same code and message, running the dummy verification for unknown emails', async () => {
    const unknown = build({ member: null });
    const unknownError = await failure(unknown.service.login(webLogin, ctx()));
    expect(unknown.password.verifyDummy).toHaveBeenCalledTimes(1);
    expect(unknown.backoff.runUnknown).toHaveBeenCalledWith(
      'me@example.com',
      expect.any(Function),
    );
    expect(unknown.backoff.run).not.toHaveBeenCalled();

    const wrong = build({ verifyResult: false });
    const wrongError = await failure(wrong.service.login(webLogin, ctx()));
    expect(wrong.backoff.run).toHaveBeenCalledWith(
      MEMBER_ID,
      'login',
      expect.any(Function),
    );
    expect(wrong.password.verify).toHaveBeenCalledWith('pw', 'scrypt$stored');

    for (const error of [unknownError, wrongError]) {
      expect(error.getStatus()).toBe(401);
      expect(error.code).toBe(API_ERROR_CODES.INVALID_CREDENTIALS);
      expect(error.message).toBe(INVALID_CREDENTIALS_MESSAGE);
    }
    expect(wrong.tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('gives 403 ACCOUNT_SUSPENDED after the password matched and issues nothing', async () => {
    const { service, tx, logger } = build({
      member: member({ status: 'SUSPENDED' }),
    });
    const error = await failure(service.login(webLogin, ctx()));
    expect(error.getStatus()).toBe(403);
    expect(error.code).toBe(API_ERROR_CODES.ACCOUNT_SUSPENDED);
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'auth.login.failed',
      expect.objectContaining({
        reason: 'suspended',
        memberId: MEMBER_ID,
        source: 'login',
      }),
    );
  });

  it('refuses client ADMIN for a MEMBER with 403 ROLE_NOT_ALLOWED without issuing a token', async () => {
    const { service, tx } = build();
    const error = await failure(
      service.login(adminLogin, ctx({ origin: ADMIN_ORIGIN })),
    );
    expect(error.getStatus()).toBe(403);
    expect(error.code).toBe(API_ERROR_CODES.ROLE_NOT_ALLOWED);
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('refuses client ADMIN with a missing or foreign Origin before touching the DB or scrypt', async () => {
    for (const origin of [undefined, 'http://localhost:3000']) {
      const { service, prisma, password, logger } = build({
        member: member({ role: 'ADMIN' }),
      });
      const error = await failure(service.login(adminLogin, ctx({ origin })));
      expect(error.getStatus()).toBe(403);
      expect(error.code).toBe(API_ERROR_CODES.ORIGIN_NOT_ALLOWED);
      expect(prisma.member.findUnique).not.toHaveBeenCalled();
      expect(password.verify).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('auth.origin_rejected', {
        requestClient: 'ADMIN',
        path: '/api/v1/auth/login',
        requestId: 'req-1',
      });
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
        'localhost:3000',
      );
    }
  });

  it('issues a WEB family, signs the access token and never puts the refresh token in the body', async () => {
    const { service, tx, logger, backoff } = build();
    const result = await service.login(webLogin, ctx());

    expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.response).toEqual({
      accessToken: expect.any(String),
      expiresIn: 900,
      member: expect.objectContaining({
        id: MEMBER_ID,
        email: 'me@example.com',
        role: 'MEMBER',
      }),
    });
    expect(result.response).not.toHaveProperty('refreshToken');
    expect(result.response.member).not.toHaveProperty('passwordHash');
    expect(tx.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        memberId: MEMBER_ID,
        client: 'WEB',
        status: 'ACTIVE',
        tokenHash: hashRefreshToken(result.refreshToken!),
      }),
    });
    expect(backoff.run).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      'auth.login.succeeded',
      expect.objectContaining({ memberId: MEMBER_ID, client: 'WEB' }),
    );
  });

  it('lets an ADMIN log in with client ADMIN from the admin origin and records client ADMIN on the row', async () => {
    const { service, tx } = build({
      member: member({
        role: 'ADMIN',
        gender: null,
        birthYear: null,
        phone: null,
      }),
    });
    const result = await service.login(
      adminLogin,
      ctx({ origin: ADMIN_ORIGIN }),
    );
    expect(result.response.member).toMatchObject({
      role: 'ADMIN',
      gender: null,
      birthYear: null,
      phone: null,
    });
    expect(tx.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ client: 'ADMIN' }),
    });
  });

  it('revokes the family of a valid same-client cookie presented at login (RELOGIN)', async () => {
    const { service, tx } = build({ row: tokenRow() });
    await service.login(webLogin, ctx({ presentedToken: 'presented' }));
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam-1', status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: NOW, revokedReason: 'RELOGIN' },
    });
  });
});

describe('AuthService.refresh', () => {
  const body = { client: 'WEB' as const };

  it('gives 400 without the cookie the body client points at, and 403 for ADMIN from a foreign origin', async () => {
    const missing = build();
    const missingError = await failure(missing.service.refresh(body, ctx()));
    expect(missingError.getStatus()).toBe(400);
    expect(missingError.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    expect(missing.prisma.$transaction).not.toHaveBeenCalled();

    const origin = build();
    const originError = await failure(
      origin.service.refresh(
        { client: 'ADMIN' },
        ctx({ presentedToken: 'presented', origin: 'http://evil.example' }),
      ),
    );
    expect(originError.code).toBe(API_ERROR_CODES.ORIGIN_NOT_ALLOWED);
    expect(origin.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('gives 401 INVALID_REFRESH_TOKEN when the hash is unknown or the row client differs (warn client_mismatch)', async () => {
    const unknown = build({ row: null });
    const unknownError = await failure(
      unknown.service.refresh(body, ctx({ presentedToken: 'presented' })),
    );
    expect(unknownError.code).toBe(API_ERROR_CODES.INVALID_REFRESH_TOKEN);

    const mismatch = build({ row: tokenRow({ client: 'ADMIN' }) });
    const mismatchError = await failure(
      mismatch.service.refresh(body, ctx({ presentedToken: 'presented' })),
    );
    expect(mismatchError.getStatus()).toBe(401);
    expect(mismatchError.code).toBe(API_ERROR_CODES.INVALID_REFRESH_TOKEN);
    expect(mismatch.logger.warn).toHaveBeenCalledWith(
      'auth.refresh.client_mismatch',
      expect.objectContaining({
        memberId: MEMBER_ID,
        tokenClient: 'ADMIN',
        requestClient: 'WEB',
      }),
    );
    expect(mismatch.tx.refreshToken.update).not.toHaveBeenCalled();
  });

  it('gives 403 for a SUSPENDED member without any reuse judgement', async () => {
    const { service, tx, logger } = build({
      member: member({ status: 'SUSPENDED' }),
      row: tokenRow({
        status: 'ROTATED',
        rotatedAt: new Date(NOW.getTime() - 120_000),
      }),
    });
    const error = await failure(
      service.refresh(body, ctx({ presentedToken: 'presented' })),
    );
    expect(error.getStatus()).toBe(403);
    expect(error.code).toBe(API_ERROR_CODES.ACCOUNT_SUSPENDED);
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('maps REVOKED rows: REUSE → REFRESH_TOKEN_REUSED (warn), others → INVALID_REFRESH_TOKEN (info)', async () => {
    const logout = build({
      row: tokenRow({ status: 'REVOKED', revokedReason: 'LOGOUT' }),
    });
    const logoutError = await failure(
      logout.service.refresh(body, ctx({ presentedToken: 'presented' })),
    );
    expect(logoutError.code).toBe(API_ERROR_CODES.INVALID_REFRESH_TOKEN);
    expect(logout.logger.info).toHaveBeenCalledWith(
      'auth.refresh.revoked_presented',
      expect.objectContaining({ memberId: MEMBER_ID, revokedReason: 'LOGOUT' }),
    );

    const reuse = build({
      row: tokenRow({ status: 'REVOKED', revokedReason: 'REUSE' }),
    });
    const reuseError = await failure(
      reuse.service.refresh(body, ctx({ presentedToken: 'presented' })),
    );
    expect(reuseError.code).toBe(API_ERROR_CODES.REFRESH_TOKEN_REUSED);
    expect(reuse.logger.warn).toHaveBeenCalledWith(
      'auth.refresh.reuse_detected',
      expect.anything(),
    );
  });

  it('grants grace (access token only, no cookie) for a ROTATED row inside 60s while the family has an ACTIVE token', async () => {
    const { service, tx, logger } = build({
      row: tokenRow({
        status: 'ROTATED',
        rotatedAt: new Date(NOW.getTime() - 30_000),
      }),
      familyActive: true,
    });
    const result = await service.refresh(
      body,
      ctx({ presentedToken: 'presented' }),
    );
    expect(result.refreshToken).toBeUndefined();
    expect(result.response.accessToken).toEqual(expect.any(String));
    expect(tx.refreshToken.update).not.toHaveBeenCalled();
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'auth.refresh.grace_hit',
      expect.objectContaining({ memberId: MEMBER_ID, familyId: 'fam-1' }),
    );
  });

  it('refuses a ROTATED row inside 60s whose family was already revoked (INVALID_REFRESH_TOKEN, info)', async () => {
    const { service, tx, logger } = build({
      row: tokenRow({
        status: 'ROTATED',
        rotatedAt: new Date(NOW.getTime() - 30_000),
      }),
      familyActive: false,
    });
    const error = await failure(
      service.refresh(body, ctx({ presentedToken: 'presented' })),
    );
    expect(error.code).toBe(API_ERROR_CODES.INVALID_REFRESH_TOKEN);
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'auth.refresh.revoked_presented',
      expect.objectContaining({ revokedReason: null }),
    );
  });

  it('detects reuse outside the grace window: revokes the family (REUSE) and returns REFRESH_TOKEN_REUSED', async () => {
    const { service, tx, logger } = build({
      row: tokenRow({
        status: 'ROTATED',
        rotatedAt: new Date(NOW.getTime() - 61_000),
      }),
      familyActive: true,
    });
    const error = await failure(
      service.refresh(body, ctx({ presentedToken: 'presented' })),
    );
    expect(error.getStatus()).toBe(401);
    expect(error.code).toBe(API_ERROR_CODES.REFRESH_TOKEN_REUSED);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam-1', status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: NOW, revokedReason: 'REUSE' },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'auth.refresh.reuse_detected',
      expect.objectContaining({ memberId: MEMBER_ID, familyId: 'fam-1' }),
    );
  });

  it('gives REFRESH_TOKEN_EXPIRED past expiresAt or 90 days after familyStartedAt', async () => {
    const old = build({
      row: tokenRow({
        familyStartedAt: new Date(NOW.getTime() - 91 * 24 * 3_600_000),
      }),
    });
    expect(
      (
        await failure(
          old.service.refresh(body, ctx({ presentedToken: 'presented' })),
        )
      ).code,
    ).toBe(API_ERROR_CODES.REFRESH_TOKEN_EXPIRED);
    const expired = build({
      row: tokenRow({ expiresAt: new Date(NOW.getTime() - 1) }),
    });
    expect(
      (
        await failure(
          expired.service.refresh(body, ctx({ presentedToken: 'presented' })),
        )
      ).code,
    ).toBe(API_ERROR_CODES.REFRESH_TOKEN_EXPIRED);
  });

  it('rotates an ACTIVE row under FOR UPDATE: old → ROTATED, new ACTIVE in the same family, new cookie', async () => {
    const { service, tx, logger } = build({ row: tokenRow() });
    const result = await service.refresh(
      body,
      ctx({ presentedToken: 'presented' }),
    );

    const [strings, hash] = tx.$queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join('?')).toContain('FOR UPDATE');
    expect(hash).toBe(hashRefreshToken('presented'));
    expect(tx.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: { status: 'ROTATED', rotatedAt: NOW },
    });
    expect(tx.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        familyId: 'fam-1',
        client: 'WEB',
        status: 'ACTIVE',
        tokenHash: hashRefreshToken(result.refreshToken!),
      }),
    });
    expect(result.response.member.id).toBe(MEMBER_ID);
    expect(logger.info).toHaveBeenCalledWith(
      'auth.refresh.rotated',
      expect.objectContaining({ familyId: 'fam-1' }),
    );
  });
});

describe('AuthService.logout', () => {
  it('is idempotent: foreign ADMIN origin, missing cookie, non-ACTIVE row and client mismatch all resolve without revoking', async () => {
    const origin = build({ row: tokenRow({ client: 'ADMIN' }) });
    await origin.service.logout(
      { client: 'ADMIN' },
      ctx({ presentedToken: 'presented', origin: 'http://evil.example' }),
    );
    expect(origin.prisma.$transaction).not.toHaveBeenCalled();
    expect(origin.logger.warn).toHaveBeenCalledWith(
      'auth.origin_rejected',
      expect.objectContaining({ requestClient: 'ADMIN' }),
    );

    const noCookie = build({ row: tokenRow() });
    await noCookie.service.logout({ client: 'WEB' }, ctx());
    expect(noCookie.prisma.$transaction).not.toHaveBeenCalled();

    for (const row of [
      tokenRow({ status: 'REVOKED', revokedReason: 'LOGOUT' }),
      tokenRow({ client: 'ADMIN' }),
      null,
    ]) {
      const { service, tx } = build({ row });
      await service.logout(
        { client: 'WEB' },
        ctx({ presentedToken: 'presented' }),
      );
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    }
  });

  it('revokes the whole family (LOGOUT) for an ACTIVE token of the same client', async () => {
    const { service, tx, logger } = build({ row: tokenRow() });
    await service.logout(
      { client: 'WEB' },
      ctx({ presentedToken: 'presented' }),
    );
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam-1', status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: NOW, revokedReason: 'LOGOUT' },
    });
    expect(logger.info).toHaveBeenCalledWith(
      'auth.logout',
      expect.objectContaining({
        memberId: MEMBER_ID,
        familyId: 'fam-1',
        client: 'WEB',
      }),
    );
  });
});

describe('AuthService.changePassword', () => {
  const user = { id: MEMBER_ID, role: 'MEMBER' as const };
  const body = { currentPassword: 'old', newPassword: 'new-password-1' };

  it('verifies the current password inside the backoff chain and gives 401 on mismatch', async () => {
    const { service, backoff, password, tx } = build({ verifyResult: false });
    const error = await failure(
      service.changePassword(user, body, {
        presentedTokens: {},
        requestId: 'r',
      }),
    );
    expect(error.getStatus()).toBe(401);
    expect(error.code).toBe(API_ERROR_CODES.INVALID_CREDENTIALS);
    expect(backoff.run).toHaveBeenCalledWith(
      MEMBER_ID,
      'password',
      expect.any(Function),
    );
    expect(password.hash).not.toHaveBeenCalled();
    expect(tx.member.update).not.toHaveBeenCalled();
  });

  it('checks the caller status first', async () => {
    const withdrawn = build({ member: member({ status: 'WITHDRAWN' }) });
    expect(
      (
        await failure(
          withdrawn.service.changePassword(user, body, {
            presentedTokens: {},
            requestId: 'r',
          }),
        )
      ).code,
    ).toBe(API_ERROR_CODES.UNAUTHENTICATED);
    const suspended = build({ member: member({ status: 'SUSPENDED' }) });
    expect(
      (
        await failure(
          suspended.service.changePassword(user, body, {
            presentedTokens: {},
            requestId: 'r',
          }),
        )
      ).code,
    ).toBe(API_ERROR_CODES.ACCOUNT_SUSPENDED);
  });

  it('updates the hash and counters and revokes every other family in one transaction, keeping the presenting family', async () => {
    const { service, tx, logger, prisma } = build({ row: tokenRow() });
    await service.changePassword(user, body, {
      presentedTokens: { WEB: 'presented' },
      requestId: 'r',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.member.update).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      data: {
        passwordHash: 'scrypt$new',
        failedLoginCount: 0,
        lastFailedLoginAt: null,
      },
    });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        memberId: MEMBER_ID,
        status: 'ACTIVE',
        familyId: { notIn: ['fam-1'] },
      },
      data: {
        status: 'REVOKED',
        revokedAt: NOW,
        revokedReason: 'PASSWORD_CHANGED',
      },
    });
    expect(logger.info).toHaveBeenCalledWith(
      'auth.password.changed',
      expect.objectContaining({ memberId: MEMBER_ID, revokedFamilies: 1 }),
    );
  });

  it('keeps a ROTATED family inside the grace window (multi-tab) but not outside it, nor foreign or revoked cookies', async () => {
    const inGrace = build({
      row: tokenRow({
        status: 'ROTATED',
        rotatedAt: new Date(NOW.getTime() - 30_000),
      }),
    });
    await inGrace.service.changePassword(user, body, {
      presentedTokens: { WEB: 'presented' },
      requestId: 'r',
    });
    expect(inGrace.tx.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ familyId: { notIn: ['fam-1'] } }),
      }),
    );

    const rows = [
      tokenRow({
        status: 'ROTATED',
        rotatedAt: new Date(NOW.getTime() - 61_000),
      }),
      tokenRow({ status: 'REVOKED', revokedReason: 'LOGOUT' }),
      tokenRow({ expiresAt: new Date(NOW.getTime() - 1) }),
      tokenRow({ memberId: OTHER_ID }),
      null,
    ];
    for (const row of rows) {
      const { service, tx } = build({ row });
      await service.changePassword(user, body, {
        presentedTokens: { WEB: 'presented' },
        requestId: 'r',
      });
      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { memberId: MEMBER_ID, status: 'ACTIVE' },
        data: {
          status: 'REVOKED',
          revokedAt: NOW,
          revokedReason: 'PASSWORD_CHANGED',
        },
      });
    }
  });
});

describe('AuthService.logoutAll', () => {
  const user = { id: MEMBER_ID, role: 'MEMBER' as const };

  it("revokes every ACTIVE token (LOGOUT) regardless of client and names only this member's cookies for deletion", async () => {
    const { service, tx, logger } = build({
      row: tokenRow({ client: 'ADMIN' }),
    });
    const result = await service.logoutAll(user, {
      presentedTokens: { WEB: 'presented', ADMIN: 'presented' },
      requestId: 'r',
    });
    expect(result.clearClients).toEqual(['WEB', 'ADMIN']);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { memberId: MEMBER_ID, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: NOW, revokedReason: 'LOGOUT' },
    });
    expect(logger.info).toHaveBeenCalledWith(
      'auth.logout_all',
      expect.objectContaining({ memberId: MEMBER_ID, revokedFamilies: 1 }),
    );

    const foreign = build({ row: tokenRow({ memberId: OTHER_ID }) });
    const foreignResult = await foreign.service.logoutAll(user, {
      presentedTokens: { WEB: 'presented' },
      requestId: 'r',
    });
    expect(foreignResult.clearClients).toEqual([]);
    const none = build({ row: null });
    await expect(
      none.service.logoutAll(user, { presentedTokens: {}, requestId: 'r' }),
    ).resolves.toEqual({ clearClients: [] });
  });
});
