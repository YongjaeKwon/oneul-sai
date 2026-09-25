import { API_ERROR_CODES } from '@oneul-sai/contracts';
import {
  apiError,
  type ApiHttpException,
  type CallerUser,
} from '@oneul-sai/service-kit';
import type { MemberLookup } from '../members/member-client.js';
import { fakeLogger, loggedText } from '../testing/fakes.js';
import { ApplicationsService } from './applications.service.js';

// SPEC-003 13절 단위: ApplicationsService(가짜 prisma · 가짜 회원 조회) — 호출 순서(D3), 입금 대기 한도 조건(D2),
// 스냅샷 값, DB 에러 가르기, 로그(커밋 뒤, 거절 로그에 memberId · 성별 · 출생연도 없음).

const NOW = new Date('2026-10-01T00:00:00.000Z');
const SCHEDULE_ID = '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01';
const MEETUP_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const APPLICATION_ID = '3b241101-e2bb-4255-8caf-4136c566a962';
const CALLER: CallerUser = {
  id: '11111111-2222-4333-8444-555555555555',
  role: 'MEMBER',
};

const scheduleRow = {
  status: 'OPEN' as const,
  priceMale: 39_000,
  priceFemale: 29_000,
  applyDeadlineAt: new Date('2026-10-04T05:00:00.000Z'),
  capacityMale: 7,
  capacityFemale: 7,
  maleMinBirthYear: null,
  maleMaxBirthYear: null,
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
  locked?: boolean;
  mine?: { status: string; cancelledBy: string | null }[];
  pendingElsewhere?: number;
  active?: number;
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
      calls.push(`lock:${strings.join('?').replace(/\s+/g, ' ').trim()}`);
      return options.locked === false ? [] : [{ id: SCHEDULE_ID }];
    }),
    schedule: {
      findUniqueOrThrow: vi.fn(async () => {
        calls.push('schedule');
        return scheduleRow;
      }),
    },
    application: {
      findMany: vi.fn(async () => {
        calls.push('mine');
        return options.mine ?? [];
      }),
      count: vi.fn(async ({ where }: { where: { status?: unknown } }) => {
        const pendingQuery = where.status === 'PENDING';
        calls.push(pendingQuery ? 'pendingElsewhere' : 'countActive');
        return pendingQuery
          ? (options.pendingElsewhere ?? 0)
          : (options.active ?? 0);
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
        return { gender: 'MALE' as const, birthYear: 1994 };
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

describe('ApplicationsService.apply — order (D3)', () => {
  it('lookup → transaction → SET LOCAL → FOR UPDATE → schedule → now → mine → pending elsewhere → gender count → create', async () => {
    const { service, calls } = build();
    await service.apply(CALLER, { scheduleId: SCHEDULE_ID }, 'r');
    expect(calls).toEqual([
      'lookup',
      'transaction',
      "sql:SET LOCAL lock_timeout = '2s'",
      expect.stringMatching(
        /^lock:SELECT "id" FROM "Schedule" WHERE "id" = \? FOR UPDATE$/,
      ),
      'schedule',
      'now',
      'mine',
      'pendingElsewhere',
      'countActive',
      'create',
    ]);
  });

  it('counts pending applications only on other schedules that start after the locked now (gt, not gte)', async () => {
    const { service, tx } = build();
    await service.apply(CALLER, { scheduleId: SCHEDULE_ID }, 'r');
    expect(tx.application.count).toHaveBeenCalledWith({
      where: {
        memberId: CALLER.id,
        status: 'PENDING',
        scheduleId: { not: SCHEDULE_ID },
        schedule: { startsAt: { gt: NOW } },
      },
    });
    expect(tx.application.count).toHaveBeenCalledWith({
      where: {
        scheduleId: SCHEDULE_ID,
        gender: 'MALE',
        status: { not: 'CANCELLED' },
      },
    });
  });

  it('creates with the member gender and that gender price, logs application.created after commit without gender or price', async () => {
    const { service, tx, logger } = build({
      lookup: async () => ({ gender: 'FEMALE', birthYear: 1970 }),
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
        },
      }),
    );
    expect(result).toMatchObject({
      status: 'PENDING',
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

  it('a rejection logs application.rejected without memberId, gender or birth year', async () => {
    const { service, tx, logger } = build({ active: 7 });
    const error = await errorOf(
      service.apply(CALLER, { scheduleId: SCHEDULE_ID }, 'r'),
    );
    expect(error.getStatus()).toBe(409);
    expect(error.code).toBe(API_ERROR_CODES.SCHEDULE_FULL);
    expect(tx.application.create).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('application.rejected', {
      scheduleId: SCHEDULE_ID,
      code: API_ERROR_CODES.SCHEDULE_FULL,
      requestId: 'r',
    });
    const text = loggedText(logger);
    for (const value of [CALLER.id, 'MALE', '1994']) {
      expect(text).not.toContain(value);
    }
  });

  it.each([
    [
      'an active or operator-cancelled row decides ALREADY_APPLIED first',
      [
        { status: 'CANCELLED', cancelledBy: 'MEMBER' },
        { status: 'PENDING', cancelledBy: null },
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

  it('member: after the apply deadline → 409 APPLICATION_NOT_CANCELLABLE', async () => {
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

  it('member: an already cancelled application is a no-op 200 without a log', async () => {
    const { service, tx, logger } = build({
      stored: { status: 'CANCELLED', cancelledBy: 'ADMIN' },
    });
    const result = await service.cancelMine(CALLER, APPLICATION_ID, 'r');
    expect(result.cancelledBy).toBe('ADMIN');
    expect(tx.application.update).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('operator: checks the schedule belongs to the meetup first, then locks the application of that schedule', async () => {
    const { service, prisma, calls, logger } = build();
    await service.cancelByAdmin(
      { id: MEETUP_ID, role: 'ADMIN' },
      MEETUP_ID,
      SCHEDULE_ID,
      APPLICATION_ID,
      'r',
    );
    expect(prisma.schedule.findFirst).toHaveBeenCalledWith({
      where: { id: SCHEDULE_ID, meetupId: MEETUP_ID },
      select: { id: true },
    });
    expect(calls[2]).toMatch(
      /^lock:SELECT "id" FROM "Application" WHERE "id" = \? AND "scheduleId" = \? FOR UPDATE$/,
    );
    expect(logger.info).toHaveBeenCalledWith(
      'application.cancelled',
      expect.objectContaining({ by: 'ADMIN', adminId: MEETUP_ID }),
    );
  });

  it('operator: a schedule of another meetup → 404 SCHEDULE_NOT_FOUND before any lock', async () => {
    const { service, prisma } = build();
    prisma.schedule.findFirst.mockResolvedValueOnce(null as never);
    const error = await errorOf(
      service.cancelByAdmin(
        { id: MEETUP_ID, role: 'ADMIN' },
        MEETUP_ID,
        SCHEDULE_ID,
        APPLICATION_ID,
        'r',
      ),
    );
    expect(error.code).toBe(API_ERROR_CODES.SCHEDULE_NOT_FOUND);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
