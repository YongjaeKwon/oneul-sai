import { API_ERROR_CODES } from '@oneul-sai/contracts';
import { vi } from 'vitest';
import { WITHDRAWN_PASSWORD_HASH } from '../auth/auth.constants.js';
import type { ApiHttpException } from '../common/api-error.js';
import { Prisma } from '../generated/prisma/client.js';
import { fakeLogger } from '../testing/fakes.js';
import { decodeAccessSecret, TokenService } from '../tokens/token.service.js';
import { MEMBER_SELECT, type MemberWithSecret } from './member-select.js';
import {
  buildListWhere,
  isUniqueViolation,
  MembersService,
} from './members.service.js';

const NOW = new Date('2026-09-22T10:00:00.000Z');
const YEAR = NOW.getFullYear();
const MEMBER_ID = '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01';
const ADMIN_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const TARGET_ID = '11111111-2222-4333-8444-555555555555';

function record(overrides: Partial<MemberWithSecret> = {}): MemberWithSecret {
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

function build(
  input: {
    rows?: MemberWithSecret[];
    verifyResult?: boolean;
    createError?: unknown;
  } = {},
) {
  const rows = new Map((input.rows ?? [record()]).map((row) => [row.id, row]));
  const logger = fakeLogger();
  const tx = {
    member: {
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => ({
          ...rows.get(where.id),
          ...data,
        }),
      ),
    },
    refreshToken: {
      deleteMany: vi.fn(async () => ({ count: 2 })),
      findMany: vi.fn(async () => [{ familyId: 'f1' }]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  const prisma = {
    member: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (input.createError) throw input.createError;
        return { ...record(), ...data };
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id?: string; email?: string } }) =>
          where.id !== undefined ? (rows.get(where.id) ?? null) : null,
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => ({
          ...rows.get(where.id),
          ...data,
        }),
      ),
      findMany: vi.fn(async () => [...rows.values()]),
      count: vi.fn(async () => rows.size),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const password = {
    hash: vi.fn(async () => 'scrypt$new'),
    verify: vi.fn(async () => input.verifyResult ?? true),
    verifyDummy: vi.fn(async () => false as const),
  };
  const backoff = {
    run: vi.fn(
      async (_id: string, _source: string, verify: () => Promise<boolean>) => {
        const ok = await verify();
        return { ok, failedLoginCount: ok ? 0 : 1 };
      },
    ),
  };
  const tokens = new TokenService({
    secret: decodeAccessSecret(Buffer.alloc(32, 1).toString('base64')),
    accessTtlSeconds: 900,
    refreshTtlSeconds: 2_592_000,
    now: () => NOW,
  });
  const service = new MembersService(
    prisma as never,
    password as never,
    backoff as never,
    tokens,
    {
      logger,
      now: () => NOW,
    },
  );
  return { service, prisma, tx, password, backoff, logger };
}

async function failure(promise: Promise<unknown>): Promise<ApiHttpException> {
  try {
    await promise;
  } catch (error) {
    return error as ApiHttpException;
  }
  throw new Error('expected rejection');
}

const signup = {
  email: 'new@example.com',
  password: 'password-1',
  name: '홍길동',
  gender: 'MALE' as const,
  birthYear: YEAR - 19,
  phone: '01012345678',
  consents: { privacy: true, marketing: true },
};
const user = { id: MEMBER_ID, role: 'MEMBER' as const };
const admin = { id: ADMIN_ID, role: 'ADMIN' as const };
const adminRow = record({
  id: ADMIN_ID,
  email: 'admin@example.com',
  role: 'ADMIN',
  gender: null,
  birthYear: null,
  phone: null,
});

describe('MembersService.signup', () => {
  it('rejects birthYear above (current year − 19) with AGE_NOT_ALLOWED and accepts exactly current − 19', async () => {
    const { service, prisma } = build();
    const error = await failure(
      service.signup({ ...signup, birthYear: YEAR - 18 }),
    );
    expect(error.getStatus()).toBe(400);
    expect(error.code).toBe(API_ERROR_CODES.AGE_NOT_ALLOWED);
    expect(prisma.member.create).not.toHaveBeenCalled();

    await expect(service.signup(signup)).resolves.toMatchObject({
      email: 'new@example.com',
      marketingConsent: true,
    });
  });

  it('requires consents.privacy === true (CONSENT_REQUIRED)', async () => {
    const { service } = build();
    const error = await failure(
      service.signup({
        ...signup,
        consents: { privacy: false, marketing: false },
      }),
    );
    expect(error.code).toBe(API_ERROR_CODES.CONSENT_REQUIRED);
  });

  it('stores the scrypt hash and consent timestamps, selects without passwordHash and logs member.created', async () => {
    const { service, prisma, password, logger } = build();
    const profile = await service.signup(signup);

    expect(password.hash).toHaveBeenCalledWith('password-1');
    expect(prisma.member.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'new@example.com',
        passwordHash: 'scrypt$new',
        privacyAgreedAt: NOW,
        marketingAgreedAt: NOW,
      }),
      select: MEMBER_SELECT,
    });
    expect(MEMBER_SELECT).not.toHaveProperty('passwordHash');
    expect(profile).not.toHaveProperty('passwordHash');
    expect(logger.info).toHaveBeenCalledWith('member.created', {
      memberId: MEMBER_ID,
      role: 'MEMBER',
    });
  });

  it('turns Prisma P2002 on email into 409 EMAIL_ALREADY_EXISTS without echoing the email', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '7.10.0',
        meta: { target: ['email'] },
      },
    );
    const { service } = build({ createError: p2002 });
    const error = await failure(service.signup(signup));
    expect(error.getStatus()).toBe(409);
    expect(error.code).toBe(API_ERROR_CODES.EMAIL_ALREADY_EXISTS);
    expect(error.message).not.toContain('new@example.com');

    expect(isUniqueViolation(new Error('other'), 'email')).toBe(false);
    const other = build({ createError: new Error('db down') });
    await expect(other.service.signup(signup)).rejects.toThrow('db down');
  });
});

describe('MembersService.me', () => {
  it('maps status: WITHDRAWN → 401, SUSPENDED → 403; ADMIN profile has null gender/birthYear/phone', async () => {
    const withdrawn = build({
      rows: [record({ status: 'WITHDRAWN', name: null })],
    });
    expect((await failure(withdrawn.service.me(user))).code).toBe(
      API_ERROR_CODES.UNAUTHENTICATED,
    );

    const suspended = build({ rows: [record({ status: 'SUSPENDED' })] });
    expect((await failure(suspended.service.me(user))).code).toBe(
      API_ERROR_CODES.ACCOUNT_SUSPENDED,
    );

    const asAdmin = build({ rows: [adminRow] });
    await expect(asAdmin.service.me(admin)).resolves.toMatchObject({
      role: 'ADMIN',
      gender: null,
      birthYear: null,
      phone: null,
      createdAt: NOW.toISOString(),
    });
  });
});

describe('MembersService.updateMyProfile', () => {
  it('marketingConsent true twice leaves marketingAgreedAt untouched; false records the withdrawal', async () => {
    const agreed = build({ rows: [record({ marketingAgreedAt: NOW })] });
    await agreed.service.updateMyProfile(user, { marketingConsent: true }, 'r');
    expect(agreed.prisma.member.update).not.toHaveBeenCalled();
    expect(agreed.password.verify).not.toHaveBeenCalled();
    expect(agreed.backoff.run).not.toHaveBeenCalled();

    const revoke = await agreed.service.updateMyProfile(
      user,
      { marketingConsent: false },
      'r',
    );
    expect(agreed.prisma.member.update).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      data: { marketingAgreedAt: null, marketingWithdrawnAt: NOW },
      select: MEMBER_SELECT,
    });
    expect(revoke.marketingConsent).toBe(false);
  });

  it('phone change needs currentPassword, verifies it in the backoff chain (source phone) and logs member.phone_changed', async () => {
    const noPassword = build();
    expect(
      (
        await failure(
          noPassword.service.updateMyProfile(
            user,
            { phone: '01099998888' },
            'r',
          ),
        )
      ).code,
    ).toBe(API_ERROR_CODES.VALIDATION_FAILED);

    const wrong = build({ verifyResult: false });
    const error = await failure(
      wrong.service.updateMyProfile(
        user,
        { phone: '01099998888', currentPassword: 'bad' },
        'r',
      ),
    );
    expect(error.getStatus()).toBe(401);
    expect(error.code).toBe(API_ERROR_CODES.INVALID_CREDENTIALS);
    expect(wrong.backoff.run).toHaveBeenCalledWith(
      MEMBER_ID,
      'phone',
      expect.any(Function),
    );
    expect(wrong.prisma.member.update).not.toHaveBeenCalled();

    const ok = build();
    const profile = await ok.service.updateMyProfile(
      user,
      { phone: '01099998888', currentPassword: 'good' },
      'r',
    );
    expect(ok.password.verify).toHaveBeenCalledWith('good', 'scrypt$stored');
    expect(ok.prisma.member.update).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      data: { phone: '01099998888' },
      select: MEMBER_SELECT,
    });
    expect(profile.phone).toBe('01099998888');
    expect(ok.logger.info).toHaveBeenCalledWith('member.phone_changed', {
      memberId: MEMBER_ID,
      requestId: 'r',
    });
    expect(JSON.stringify(ok.logger.info.mock.calls)).not.toContain(
      '01099998888',
    );
  });
});

describe('MembersService.withdraw', () => {
  it('gives 401 and counts the failure (source withdraw) on a wrong password', async () => {
    const { service, backoff, tx } = build({ verifyResult: false });
    const error = await failure(
      service.withdraw(user, { password: 'bad' }, 'r'),
    );
    expect(error.code).toBe(API_ERROR_CODES.INVALID_CREDENTIALS);
    expect(backoff.run).toHaveBeenCalledWith(
      MEMBER_ID,
      'withdraw',
      expect.any(Function),
    );
    expect(tx.member.update).not.toHaveBeenCalled();
  });

  it('anonymizes and deletes refresh tokens in one transaction', async () => {
    const { service, prisma, tx, logger } = build({
      rows: [record({ marketingAgreedAt: NOW })],
    });
    await service.withdraw(user, { password: 'good' }, 'r');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.member.update).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: NOW,
        email: `withdrawn+${MEMBER_ID}@invalid`,
        name: null,
        gender: null,
        birthYear: null,
        phone: null,
        passwordHash: WITHDRAWN_PASSWORD_HASH,
        failedLoginCount: 0,
        lastFailedLoginAt: null,
        marketingAgreedAt: null,
        marketingWithdrawnAt: NOW,
      },
    });
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { memberId: MEMBER_ID },
    });
    expect(logger.info).toHaveBeenCalledWith('member.withdrawn', {
      memberId: MEMBER_ID,
      requestId: 'r',
    });
  });
});

describe('MembersService admin APIs', () => {
  const target = record({ id: TARGET_ID, email: 'target@example.com' });

  it('updateStatus: self → 400, withdrawn target → 409, same status → no-op, suspended caller → 403', async () => {
    const { service, prisma } = build({
      rows: [
        adminRow,
        target,
        record({ id: MEMBER_ID, status: 'WITHDRAWN', name: null }),
      ],
    });
    expect(
      (
        await failure(
          service.updateStatus(
            admin,
            ADMIN_ID,
            { status: 'SUSPENDED', reason: 'x' },
            'r',
          ),
        )
      ).code,
    ).toBe(API_ERROR_CODES.SELF_STATUS_CHANGE);
    expect(
      (
        await failure(
          service.updateStatus(
            admin,
            MEMBER_ID,
            { status: 'SUSPENDED', reason: 'x' },
            'r',
          ),
        )
      ).code,
    ).toBe(API_ERROR_CODES.INVALID_STATUS_TRANSITION);
    await expect(
      service.updateStatus(admin, TARGET_ID, { status: 'ACTIVE' }, 'r'),
    ).resolves.toMatchObject({
      id: TARGET_ID,
      status: 'ACTIVE',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();

    const suspendedAdmin = build({
      rows: [record({ ...adminRow, status: 'SUSPENDED' }), target],
    });
    expect(
      (
        await failure(
          suspendedAdmin.service.updateStatus(
            admin,
            TARGET_ID,
            { status: 'SUSPENDED', reason: 'x' },
            'r',
          ),
        )
      ).code,
    ).toBe(API_ERROR_CODES.ACCOUNT_SUSPENDED);
    const memberCaller = build({ rows: [record(), target] });
    expect(
      (
        await failure(
          memberCaller.service.updateStatus(
            { id: '00000000-0000-4000-8000-000000000000', role: 'ADMIN' },
            TARGET_ID,
            { status: 'ACTIVE' },
            'r',
          ),
        )
      ).code,
    ).toBe(API_ERROR_CODES.UNAUTHENTICATED);
  });

  it('updateStatus: ACTIVE → SUSPENDED stores the reason, revokes sessions (SUSPENDED) and logs the transition', async () => {
    const { service, tx, logger } = build({ rows: [adminRow, target] });
    const detail = await service.updateStatus(
      admin,
      TARGET_ID,
      { status: 'SUSPENDED', reason: '정책 위반' },
      'r',
    );

    expect(tx.member.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { status: 'SUSPENDED', statusReason: '정책 위반' },
      select: MEMBER_SELECT,
    });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { memberId: TARGET_ID, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: NOW, revokedReason: 'SUSPENDED' },
    });
    expect(detail).toMatchObject({
      status: 'SUSPENDED',
      statusReason: '정책 위반',
    });
    expect(logger.info).toHaveBeenCalledWith('member.status_changed', {
      memberId: TARGET_ID,
      from: 'ACTIVE',
      to: 'SUSPENDED',
      adminId: ADMIN_ID,
      requestId: 'r',
    });
  });

  it('list: selects without passwordHash, logs member.list_viewed without the search term', async () => {
    const { service, prisma, logger } = build({ rows: [adminRow, target] });
    const page = await service.list(
      admin,
      { query: '010-1234', page: 2, pageSize: 20 },
      'r',
    );

    expect(prisma.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: MEMBER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: 20,
        take: 20,
      }),
    );
    expect(page).toMatchObject({ total: 2, page: 2, pageSize: 20 });
    expect(page.items[0]).not.toHaveProperty('passwordHash');
    expect(logger.info).toHaveBeenCalledWith('member.list_viewed', {
      adminId: ADMIN_ID,
      hasFilter: true,
      count: 2,
      requestId: 'r',
    });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('010-1234');
  });

  it('buildListWhere: email/name partial match plus phone prefix only for digit queries', () => {
    expect(
      buildListWhere({
        query: '010-3333',
        status: 'ACTIVE',
        role: 'MEMBER',
        page: 1,
        pageSize: 20,
      }),
    ).toEqual({
      status: 'ACTIVE',
      role: 'MEMBER',
      OR: [
        { email: { contains: '010-3333', mode: 'insensitive' } },
        { name: { contains: '010-3333' } },
        { phone: { startsWith: '0103333' } },
      ],
    });
    expect(
      buildListWhere({ query: '앨리스', page: 1, pageSize: 20 }).OR,
    ).toHaveLength(2);
    expect(buildListWhere({ page: 1, pageSize: 20 })).toEqual({});
  });

  it('detail: 404 MEMBER_NOT_FOUND when missing, otherwise MemberDetail + member.detail_viewed', async () => {
    const { service, logger } = build({
      rows: [
        adminRow,
        record({
          id: TARGET_ID,
          status: 'WITHDRAWN',
          name: null,
          email: `withdrawn+${TARGET_ID}@invalid`,
        }),
      ],
    });
    expect(
      (
        await failure(
          service.detail(admin, '00000000-0000-4000-8000-000000000000', 'r'),
        )
      ).code,
    ).toBe(API_ERROR_CODES.MEMBER_NOT_FOUND);
    const detail = await service.detail(admin, TARGET_ID, 'r');
    expect(detail).toMatchObject({
      status: 'WITHDRAWN',
      name: null,
      failedLoginCount: 0,
      lastFailedLoginAt: null,
    });
    expect(detail).not.toHaveProperty('passwordHash');
    expect(logger.info).toHaveBeenCalledWith('member.detail_viewed', {
      adminId: ADMIN_ID,
      memberId: TARGET_ID,
      requestId: 'r',
    });
  });
});
