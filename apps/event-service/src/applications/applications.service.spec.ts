import { API_ERROR_CODES } from '@oneul-sai/contracts';
import {
  apiError,
  type ApiHttpException,
  type CallerUser,
} from '@oneul-sai/service-kit';
import type { MemberLookup } from '../members/member-client.js';
import { fakeLogger, loggedText } from '../testing/fakes.js';
import { ApplicationsService } from './applications.service.js';

// SPEC-003 13절 단위(개정): ApplicationsService(가짜 prisma · 가짜 회원 조회) — 신청의 호출 순서(D3 · D15, 성별 집계 없음),
// 입금 대기 한도 조건(D2), 스냅샷 값, DB 에러 가르기, 참가 가능 안내의 순서(D16 — 회차 행 → 신청 행 → 별도 집계),
// 로그(커밋 뒤, 거절 로그에 memberId · 성별 없음).

const NOW = new Date('2026-10-01T00:00:00.000Z');
const SCHEDULE_ID = '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01';
const MEETUP_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const APPLICATION_ID = '3b241101-e2bb-4255-8caf-4136c566a962';
const CALLER: CallerUser = {
  id: '11111111-2222-4333-8444-555555555555',
  role: 'MEMBER',
};
const ADMIN: CallerUser = { id: MEETUP_ID, role: 'ADMIN' };

const scheduleRow = {
  status: 'OPEN' as const,
  priceMale: 39_000,
  priceFemale: 29_000,
  applyDeadlineAt: new Date('2026-10-04T05:00:00.000Z'),
  capacityMale: 7,
  capacityFemale: 7,
};

const applicationRow = (overrides: Record<string, unknown> = {}) => ({
  id: APPLICATION_ID,
  scheduleId: SCHEDULE_ID,
  memberId: CALLER.id,
  gender: 'MALE',
  status: 'PENDING',
  cancelledBy: null,
  price: 39_000,
  createdAt: NOW,
  updatedAt: NOW,
  schedule: {
    startsAt: new Date('2026-10-04T05:00:00.000Z'),
    endsAt: new Date('2026-10-04T07:00:00.000Z'),
    applyDeadlineAt: new Date('2026-10-04T05:00:00.000Z'),
    venueArea: '성수',
    status: 'OPEN',
    meetup: { title: '오늘사이' },
  },
  ...overrides,
});

interface BuildOptions {
  /** 회차 행 FOR UPDATE가 행을 찾는가(신청 · 안내) */
  locked?: boolean;
  /** 신청 행 FOR UPDATE가 행을 찾는가(취소 · 안내). 없으면 `locked`를 따른다 */
  applicationLocked?: boolean;
  mine?: { status: string; cancelledBy: string | null }[];
  pendingElsewhere?: number;
  /** 그 성별의 자리 잡은 수(`countSeated`) */
  seated?: number;
  schedule?: Partial<typeof scheduleRow>;
  createError?: unknown;
  lookup?: MemberLookup['lookupSelf'];
  stored?: Record<string, unknown>;
}

function build(options: BuildOptions = {}) {
  const logger = fakeLogger();
  const calls: string[] = [];
  const now = vi.fn(() => {
    calls.push('now');
    return NOW;
  });
  const tx = {
    $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
      calls.push(`sql:${strings.join('?')}`);
      return 0;
    }),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join('?').replace(/\s+/g, ' ').trim();
      calls.push(`lock:${sql}`);
      const found = sql.includes('"Application"')
        ? (options.applicationLocked ?? options.locked)
        : options.locked;
      return found === false ? [] : [{ id: SCHEDULE_ID }];
    }),
    schedule: {
      findUniqueOrThrow: vi.fn(async () => {
        calls.push('schedule');
        return { ...scheduleRow, ...options.schedule };
      }),
    },
    application: {
      findMany: vi.fn(async () => {
        calls.push('mine');
        return options.mine ?? [];
      }),
      count: vi.fn(async ({ where }: { where: { status?: unknown } }) => {
        const pendingQuery = where.status === 'PENDING';
        calls.push(pendingQuery ? 'pendingElsewhere' : 'countSeated');
        return pendingQuery
          ? (options.pendingElsewhere ?? 0)
          : (options.seated ?? 0);
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        calls.push('create');
        if (options.createError !== undefined) throw options.createError;
        return applicationRow(data);
      }),
      findUniqueOrThrow: vi.fn(async () => {
        calls.push('read');
        return applicationRow(options.stored);
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        calls.push('update');
        return applicationRow({ ...options.stored, ...data });
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => {
      calls.push('transaction');
      return fn(tx);
    }),
    schedule: {
      findFirst: vi.fn(async () => ({ id: SCHEDULE_ID })),
    },
    application: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
  };
  const lookupSelf = vi.fn(
    options.lookup ??
      (async () => {
        calls.push('lookup');
        return { gender: 'MALE' as const };
      }),
  );
  const service = new ApplicationsService(
    prisma as unknown as ConstructorParameters<typeof ApplicationsService>[0],
    { lookupSelf },
    { logger, now },
  );
  return { service, prisma, tx, logger, calls, lookupSelf };
}

async function errorOf(promise: Promise<unknown>): Promise<ApiHttpException> {
  return (await promise.catch((e: unknown) => e)) as ApiHttpException;
}

const dbError = (originalCode: string, constraint?: string) =>
  Object.assign(new Error('db'), {
    code: 'P2010',
    meta: {
      driverAdapterError: {
        cause: {
          originalCode,
          ...(constraint !== undefined && {
            constraint: { index: constraint },
          }),
        },
      },
    },
  });

const LOCK_SCHEDULE =
  /^lock:SELECT "id" FROM "Schedule" WHERE "id" = \? FOR UPDATE$/;
const LOCK_APPLICATION_OF_SCHEDULE =
  /^lock:SELECT "id" FROM "Application" WHERE "id" = \? AND "scheduleId" = \? FOR UPDATE$/;

describe('ApplicationsService.apply — order (D3 · D15)', () => {
  it('lookup → transaction → SET LOCAL → FOR UPDATE → schedule → now → mine → pending elsewhere → create (no gender count)', async () => {
    const { service, calls } = build();
    await service.apply(CALLER, { scheduleId: SCHEDULE_ID }, 'r');
    expect(calls).toEqual([
      'lookup',
      'transaction',
      "sql:SET LOCAL lock_timeout = '2s'",
      expect.stringMatching(LOCK_SCHEDULE),
      'schedule',
      'now',
      'mine',
      'pendingElsewhere',
      'create',
    ]);
  });

  it('counts only pending applications on other schedules that start after the locked now (gt, not gte) — never seats', async () => {
    const { service, tx } = build();
    await service.apply(CALLER, { scheduleId: SCHEDULE_ID }, 'r');
    expect(tx.application.count).toHaveBeenCalledTimes(1);
    expect(tx.application.count).toHaveBeenCalledWith({
      where: {
        memberId: CALLER.id,
        status: 'PENDING',
        scheduleId: { not: SCHEDULE_ID },
        schedule: { startsAt: { gt: NOW } },
      },
    });
  });

  it('creates APPLIED with the member gender and that gender price, logs application.created after commit without gender or price', async () => {
    const { service, tx, logger } = build({
      lookup: async () => ({ gender: 'FEMALE' }),
    });
    const result = await service.apply(
      CALLER,
      { scheduleId: SCHEDULE_ID },
      'r',
    );
    expect(tx.application.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          scheduleId: SCHEDULE_ID,
          memberId: CALLER.id,
          gender: 'FEMALE',
          price: 29_000,
          status: 'APPLIED',
        },
      }),
    );
    expect(result).toMatchObject({
      status: 'APPLIED',
      schedule: { title: '오늘사이' },
    });
    expect(logger.info).toHaveBeenCalledWith('application.created', {
      memberId: CALLER.id,
      scheduleId: SCHEDULE_ID,
      applicationId: APPLICATION_ID,
      requestId: 'r',
    });
    expect(loggedText(logger)).not.toContain('FEMALE');
    expect(loggedText(logger)).not.toContain('29000');
  });

  it('does not open a transaction when the member lookup fails', async () => {
    const { service, prisma } = build({
      lookup: async () => {
        throw apiError(503, API_ERROR_CODES.SERVICE_BUSY, 'busy');
      },
    });
    const error = await errorOf(
      service.apply(CALLER, { scheduleId: SCHEDULE_ID }, 'r'),
    );
    expect(error.code).toBe(API_ERROR_CODES.SERVICE_BUSY);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a missing schedule → 404 without reading it and without a rejected log', async () => {
    const { service, tx, logger } = build({ locked: false });
    const error = await errorOf(
      service.apply(CALLER, { scheduleId: SCHEDULE_ID }, 'r'),
    );
    expect(error.getStatus()).toBe(404);
    expect(error.code).toBe(API_ERROR_CODES.SCHEDULE_NOT_FOUND);
    expect(tx.schedule.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.application.create).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('a rejection logs application.rejected without memberId or gender', async () => {
    const { service, tx, logger } = build({ pendingElsewhere: 1 });
    const error = await errorOf(
      service.apply(CALLER, { scheduleId: SCHEDULE_ID }, 'r'),
    );
    expect(error.getStatus()).toBe(409);
    expect(error.code).toBe(API_ERROR_CODES.PENDING_APPLICATION_LIMIT);
    expect(tx.application.create).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('application.rejected', {
      scheduleId: SCHEDULE_ID,
      code: API_ERROR_CODES.PENDING_APPLICATION_LIMIT,
      requestId: 'r',
    });
    const text = loggedText(logger);
    for (const value of [CALLER.id, 'MALE']) {
      expect(text).not.toContain(value);
    }
  });

  it.each([
    [
      'an active (APPLIED) row decides ALREADY_APPLIED first',
      [
        { status: 'CANCELLED', cancelledBy: 'MEMBER' },
        { status: 'APPLIED', cancelledBy: null },
      ],
      API_ERROR_CODES.ALREADY_APPLIED,
    ],
    [
      'an operator-cancelled row → REAPPLY_NOT_ALLOWED',
      [{ status: 'CANCELLED', cancelledBy: 'ADMIN' }],
      API_ERROR_CODES.REAPPLY_NOT_ALLOWED,
    ],
  ])('%s', async (_label, mine, code) => {
    const { service } = build({ mine });
    const error = await errorOf(
      service.apply(CALLER, { scheduleId: SCHEDULE_ID }, 'r'),
    );
    expect(error.code).toBe(code);
  });

  it('own cancelled rows only → a new application', async () => {
    const { service, tx } = build({
      mine: [{ status: 'CANCELLED', cancelledBy: 'MEMBER' }],
    });
    await service.apply(CALLER, { scheduleId: SCHEDULE_ID }, 'r');
    expect(tx.application.create).toHaveBeenCalled();
  });
});

describe('ApplicationsService.apply — DB errors', () => {
  it('23505 on Application_active_member_key → 409 ALREADY_APPLIED', async () => {
    const { service, logger } = build({
      createError: dbError('23505', 'Application_active_member_key'),
    });
    const error = await errorOf(
      service.apply(CALLER, { scheduleId: SCHEDULE_ID }, 'r'),
    );
    expect(error.getStatus()).toBe(409);
    expect(error.code).toBe(API_ERROR_CODES.ALREADY_APPLIED);
    expect(logger.info).not.toHaveBeenCalledWith(
      'application.created',
      expect.anything(),
    );
  });

  it('23505 on another constraint propagates as is', async () => {
    const original = dbError('23505', 'Application_pkey');
    const { service } = build({ createError: original });
    const error = await service
      .apply(CALLER, { scheduleId: SCHEDULE_ID }, 'r')
      .catch((e: unknown) => e);
    expect(error).toBe(original);
  });

  it.each([
    ['55P03 (lock timeout)', dbError('55P03'), 'lock_timeout'],
    [
      'P2028 (connection wait)',
      Object.assign(new Error('pool'), { code: 'P2028' }),
      'pool',
    ],
  ])(
    '%s → 503 SERVICE_BUSY + application.busy',
    async (_label, cause, expected) => {
      const { service, logger } = build({ createError: cause });
      const error = await errorOf(
        service.apply(CALLER, { scheduleId: SCHEDULE_ID }, 'r'),
      );
      expect(error.getStatus()).toBe(503);
      expect(error.code).toBe(API_ERROR_CODES.SERVICE_BUSY);
      expect(logger.warn).toHaveBeenCalledWith('application.busy', {
        scheduleId: SCHEDULE_ID,
        cause: expected,
        requestId: 'r',
      });
    },
  );
});

describe('ApplicationsService cancel', () => {
  it('member: locks only the application row (own), cancels as MEMBER and logs after commit', async () => {
    const { service, calls, tx, logger } = build();
    const result = await service.cancelMine(CALLER, APPLICATION_ID, 'r');
    expect(calls[2]).toMatch(
      /^lock:SELECT "id" FROM "Application" WHERE "id" = \? AND "memberId" = \? FOR UPDATE$/,
    );
    expect(tx.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'CANCELLED', cancelledBy: 'MEMBER' },
      }),
    );
    expect(result.cancelledBy).toBe('MEMBER');
    expect(logger.info).toHaveBeenCalledWith('application.cancelled', {
      applicationId: APPLICATION_ID,
      scheduleId: SCHEDULE_ID,
      by: 'MEMBER',
      memberId: CALLER.id,
      requestId: 'r',
    });
  });

  it('member: someone else’s or a missing application → 404 APPLICATION_NOT_FOUND', async () => {
    const { service, tx } = build({ locked: false });
    const error = await errorOf(
      service.cancelMine(CALLER, APPLICATION_ID, 'r'),
    );
    expect(error.getStatus()).toBe(404);
    expect(error.code).toBe(API_ERROR_CODES.APPLICATION_NOT_FOUND);
    expect(tx.application.update).not.toHaveBeenCalled();
  });

  it('member: PENDING after the apply deadline → 409 APPLICATION_NOT_CANCELLABLE', async () => {
    const { service, tx } = build({
      stored: {
        schedule: {
          ...applicationRow().schedule,
          applyDeadlineAt: NOW,
        },
      },
    });
    const error = await errorOf(
      service.cancelMine(CALLER, APPLICATION_ID, 'r'),
    );
    expect(error.code).toBe(API_ERROR_CODES.APPLICATION_NOT_CANCELLABLE);
    expect(tx.application.update).not.toHaveBeenCalled();
  });

  it('member: APPLIED after the apply deadline → cancelled (S3 — any time)', async () => {
    const { service, tx } = build({
      stored: {
        status: 'APPLIED',
        schedule: { ...applicationRow().schedule, applyDeadlineAt: NOW },
      },
    });
    const result = await service.cancelMine(CALLER, APPLICATION_ID, 'r');
    expect(result.cancelledBy).toBe('MEMBER');
    expect(tx.application.update).toHaveBeenCalled();
  });

  it('member: CONFIRMED → 409 APPLICATION_CONFIRMED even before the deadline (SPEC-004 D10)', async () => {
    const { service, tx } = build({ stored: { status: 'CONFIRMED' } });
    const error = await errorOf(
      service.cancelMine(CALLER, APPLICATION_ID, 'r'),
    );
    expect(error.getStatus()).toBe(409);
    expect(error.code).toBe(API_ERROR_CODES.APPLICATION_CONFIRMED);
    expect(tx.application.update).not.toHaveBeenCalled();
  });

  it('member: an already cancelled application is a no-op 200 without a log', async () => {
    const { service, tx, logger } = build({
      stored: { status: 'CANCELLED', cancelledBy: 'ADMIN' },
    });
    const result = await service.cancelMine(CALLER, APPLICATION_ID, 'r');
    expect(result.cancelledBy).toBe('ADMIN');
    expect(tx.application.update).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('member: a lock timeout → 503 with application.busy naming the application (the schedule is unknown before the lock)', async () => {
    const { service, tx, logger } = build();
    tx.$queryRaw.mockRejectedValueOnce(dbError('55P03'));
    const error = await errorOf(
      service.cancelMine(CALLER, APPLICATION_ID, 'r'),
    );
    expect(error.getStatus()).toBe(503);
    expect(logger.warn).toHaveBeenCalledWith('application.busy', {
      applicationId: APPLICATION_ID,
      cause: 'lock_timeout',
      requestId: 'r',
    });
  });

  it('operator: checks the schedule belongs to the meetup first, then locks the application of that schedule', async () => {
    const { service, prisma, calls, logger } = build();
    await service.cancelByAdmin(
      ADMIN,
      MEETUP_ID,
      SCHEDULE_ID,
      APPLICATION_ID,
      'r',
    );
    expect(prisma.schedule.findFirst).toHaveBeenCalledWith({
      where: { id: SCHEDULE_ID, meetupId: MEETUP_ID },
      select: { id: true },
    });
    expect(calls[2]).toMatch(LOCK_APPLICATION_OF_SCHEDULE);
    expect(logger.info).toHaveBeenCalledWith(
      'application.cancelled',
      expect.objectContaining({
        by: 'ADMIN',
        adminId: ADMIN.id,
        wasConfirmed: false,
      }),
    );
  });

  it('operator: a CONFIRMED application is cancelled and logged with wasConfirmed: true (SPEC-004 6절)', async () => {
    const { service, tx, logger } = build({ stored: { status: 'CONFIRMED' } });
    const result = await service.cancelByAdmin(
      ADMIN,
      MEETUP_ID,
      SCHEDULE_ID,
      APPLICATION_ID,
      'r',
    );
    expect(result).toMatchObject({ status: 'CANCELLED', cancelledBy: 'ADMIN' });
    expect(tx.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'CANCELLED', cancelledBy: 'ADMIN' },
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'application.cancelled',
      expect.objectContaining({ wasConfirmed: true }),
    );
  });

  it('operator: an already cancelled application is a no-op 200 without a log (6절 전이 표)', async () => {
    const { service, tx, logger } = build({
      stored: { status: 'CANCELLED', cancelledBy: 'MEMBER' },
    });
    const result = await service.cancelByAdmin(
      ADMIN,
      MEETUP_ID,
      SCHEDULE_ID,
      APPLICATION_ID,
      'r',
    );
    expect(result.cancelledBy).toBe('MEMBER');
    expect(tx.application.update).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('operator: a schedule of another meetup → 404 SCHEDULE_NOT_FOUND before any lock', async () => {
    const { service, prisma } = build();
    prisma.schedule.findFirst.mockResolvedValueOnce(null as never);
    const error = await errorOf(
      service.cancelByAdmin(ADMIN, MEETUP_ID, SCHEDULE_ID, APPLICATION_ID, 'r'),
    );
    expect(error.code).toBe(API_ERROR_CODES.SCHEDULE_NOT_FOUND);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('ApplicationsService.inviteByAdmin (D16)', () => {
  const invite = (service: ApplicationsService) =>
    service.inviteByAdmin(ADMIN, MEETUP_ID, SCHEDULE_ID, APPLICATION_ID, 'r');

  it('meetup check → transaction → SET LOCAL → schedule FOR UPDATE → application FOR UPDATE → read both → seated count (separate statement) → update PENDING', async () => {
    const { service, prisma, calls, tx, logger } = build({
      stored: { status: 'APPLIED' },
      seated: 6,
    });
    const result = await invite(service);
    expect(prisma.schedule.findFirst).toHaveBeenCalledWith({
      where: { id: SCHEDULE_ID, meetupId: MEETUP_ID },
      select: { id: true },
    });
    expect(calls).toEqual([
      'transaction',
      "sql:SET LOCAL lock_timeout = '2s'",
      expect.stringMatching(LOCK_SCHEDULE),
      expect.stringMatching(LOCK_APPLICATION_OF_SCHEDULE),
      'read',
      'schedule',
      'countSeated',
      'update',
    ]);
    expect(tx.application.count).toHaveBeenCalledWith({
      where: {
        scheduleId: SCHEDULE_ID,
        gender: 'MALE',
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });
    expect(tx.application.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PENDING' } }),
    );
    expect(result.status).toBe('PENDING');
    expect(logger.info).toHaveBeenCalledWith('application.invited', {
      adminId: ADMIN.id,
      applicationId: APPLICATION_ID,
      scheduleId: SCHEDULE_ID,
      requestId: 'r',
    });
  });

  it('counts the seats of the application gender against that gender capacity', async () => {
    const { service, tx } = build({
      stored: { status: 'APPLIED', gender: 'FEMALE' },
      schedule: { capacityFemale: 2 },
      seated: 2,
    });
    const error = await errorOf(invite(service));
    expect(error.code).toBe(API_ERROR_CODES.SCHEDULE_FULL);
    expect(tx.application.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ gender: 'FEMALE' }),
      }),
    );
  });

  it('a full gender → 409 SCHEDULE_FULL + application.rejected with adminId · applicationId · code, no memberId', async () => {
    const { service, tx, logger } = build({
      stored: { status: 'APPLIED' },
      seated: 7,
    });
    const error = await errorOf(invite(service));
    expect(error.getStatus()).toBe(409);
    expect(error.code).toBe(API_ERROR_CODES.SCHEDULE_FULL);
    expect(tx.application.update).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('application.rejected', {
      adminId: ADMIN.id,
      applicationId: APPLICATION_ID,
      code: API_ERROR_CODES.SCHEDULE_FULL,
      requestId: 'r',
    });
    expect(loggedText(logger)).not.toContain(CALLER.id);
    expect(loggedText(logger)).not.toContain('MALE');
  });

  it.each([['CONFIRMED'], ['CANCELLED']])(
    'a %s application → 409 INVALID_STATUS_TRANSITION without an update',
    async (status) => {
      const { service, tx, logger } = build({
        stored: {
          status,
          cancelledBy: status === 'CANCELLED' ? 'MEMBER' : null,
        },
      });
      const error = await errorOf(invite(service));
      expect(error.code).toBe(API_ERROR_CODES.INVALID_STATUS_TRANSITION);
      expect(tx.application.update).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'application.rejected',
        expect.objectContaining({
          code: API_ERROR_CODES.INVALID_STATUS_TRANSITION,
        }),
      );
    },
  );

  it('an already PENDING application is a no-op 200 without update or log', async () => {
    const { service, tx, logger } = build({ stored: { status: 'PENDING' } });
    const result = await invite(service);
    expect(result.status).toBe('PENDING');
    expect(tx.application.update).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('an application of another schedule → 404 APPLICATION_NOT_FOUND after the schedule lock, without reading', async () => {
    const { service, tx } = build({ applicationLocked: false });
    const error = await errorOf(invite(service));
    expect(error.getStatus()).toBe(404);
    expect(error.code).toBe(API_ERROR_CODES.APPLICATION_NOT_FOUND);
    expect(tx.application.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('a schedule of another meetup → 404 SCHEDULE_NOT_FOUND before any transaction', async () => {
    const { service, prisma } = build();
    prisma.schedule.findFirst.mockResolvedValueOnce(null as never);
    const error = await errorOf(invite(service));
    expect(error.code).toBe(API_ERROR_CODES.SCHEDULE_NOT_FOUND);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['55P03 (lock timeout)', dbError('55P03'), 'lock_timeout'],
    [
      'P2028 (connection wait)',
      Object.assign(new Error('pool'), { code: 'P2028' }),
      'pool',
    ],
  ])(
    '%s → 503 SERVICE_BUSY + application.busy with the schedule',
    async (_label, cause, expected) => {
      const { service, tx, logger } = build({ stored: { status: 'APPLIED' } });
      tx.$queryRaw.mockRejectedValueOnce(cause);
      const error = await errorOf(invite(service));
      expect(error.getStatus()).toBe(503);
      expect(error.code).toBe(API_ERROR_CODES.SERVICE_BUSY);
      expect(logger.warn).toHaveBeenCalledWith('application.busy', {
        scheduleId: SCHEDULE_ID,
        cause: expected,
        requestId: 'r',
      });
    },
  );
});
