import { randomUUID } from 'node:crypto';
import {
  API_ERROR_CODES,
  type CreateScheduleRequest,
} from '@oneul-sai/contracts';
import type { ApiHttpException, CallerUser } from '@oneul-sai/service-kit';
import { fakeLogger, loggedText } from '../testing/fakes.js';
import type { AdminScheduleRow } from './schedule-select.js';
import { SchedulesService } from './schedules.service.js';

// SPEC-002 13절 단위: SchedulesService(가짜 prisma) — 여러 회차 등록(D15), FOR UPDATE 후 판정, 소속 404, 로그.
// SPEC-003 13절 단위(개정): 잠금 대기 상한(SET LOCAL lock_timeout → FOR UPDATE), 정원 축소 검사(자리 잡은 수 — `countSeated`),
// 회차 취소 연쇄(활성 — 접수 포함), 운영자 응답의 여섯 값(`seatCountsBySchedule` 한 번), 55P03 → 503.

const NOW = new Date('2026-10-01T00:00:00.000Z');
const MEETUP_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const SCHEDULE_ID = '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01';
const ADMIN: CallerUser = {
  id: '11111111-2222-4333-8444-555555555555',
  role: 'ADMIN',
};

function input(day: number, overrides: Partial<CreateScheduleRequest> = {}) {
  const startsAt = `2026-10-${String(day).padStart(2, '0')}T14:00:00+09:00`;
  return {
    startsAt,
    endsAt: `2026-10-${String(day).padStart(2, '0')}T16:00:00+09:00`,
    applyDeadlineAt: startsAt,
    priceMale: 39_000,
    priceFemale: 29_000,
    capacityMale: 7,
    capacityFemale: 7,
    venueArea: '성수',
    ...overrides,
  } satisfies CreateScheduleRequest;
}

function row(overrides: Partial<AdminScheduleRow> = {}): AdminScheduleRow {
  return {
    id: SCHEDULE_ID,
    meetupId: MEETUP_ID,
    startsAt: new Date('2026-10-04T05:00:00Z'),
    endsAt: new Date('2026-10-04T07:00:00Z'),
    applyDeadlineAt: new Date('2026-10-04T05:00:00Z'),
    priceMale: 39_000,
    priceFemale: 29_000,
    capacityMale: 7,
    capacityFemale: 7,
    priceNote: null,
    minPerGender: 5,
    maleMinBirthYear: null,
    maleMaxBirthYear: 1995,
    femaleMinBirthYear: null,
    femaleMaxBirthYear: null,
    participantCondition: null,
    venueArea: '성수',
    venueName: 'SECRET-NAME',
    venueAddress: null,
    venueDirections: null,
    venueMapUrl: null,
    status: 'DRAFT',
    cancelReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    meetup: { title: '오늘사이', description: '' },
    ...overrides,
  };
}

interface BuildOptions {
  meetupExists?: boolean;
  stored?: AdminScheduleRow;
  /** FOR UPDATE가 행을 찾지 못함 = 다른 상품의 회차 또는 없음 */
  locked?: boolean;
  failCreateAt?: number;
  /** 성별 자리 잡은 신청 수(`countSeated`) */
  seated?: { MALE?: number; FEMALE?: number };
  /** 회차 취소가 함께 취소한 신청 수(`updateMany`) */
  cancelled?: number;
  /** 잠금 문장이 던질 에러(잠금 대기 상한 초과 등) */
  lockError?: unknown;
}

function build(options: BuildOptions = {}) {
  const logger = fakeLogger();
  const now = vi.fn(() => NOW);
  const calls: string[] = [];
  const stored = options.stored ?? row();
  let createCount = 0;

  const createRow = async ({ data }: { data: Record<string, unknown> }) => {
    createCount += 1;
    if (createCount === options.failCreateAt) {
      throw new Error('connection lost');
    }
    return row({
      ...(data as Partial<AdminScheduleRow>),
      id: randomUUID(),
    });
  };
  const tx = {
    $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
      calls.push(`sql:${strings.join('?')}`);
      return 0;
    }),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      calls.push(`lock:${strings.join('?')}`);
      if (options.lockError !== undefined) throw options.lockError;
      return options.locked === false ? [] : [{ id: stored.id }];
    }),
    application: {
      count: vi.fn(
        async ({ where }: { where: { gender: 'MALE' | 'FEMALE' } }) => {
          calls.push(`count:${where.gender}`);
          return options.seated?.[where.gender] ?? 0;
        },
      ),
      updateMany: vi.fn(async () => {
        calls.push('cancelApplications');
        return { count: options.cancelled ?? 0 };
      }),
      groupBy: vi.fn(async () => []),
    },
    schedule: {
      findUniqueOrThrow: vi.fn(async () => {
        calls.push('read');
        return stored;
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        calls.push('update');
        // Prisma처럼 undefined인 필드는 건너뛴다
        return {
          ...stored,
          ...Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
          ),
        };
      }),
      delete: vi.fn(async () => {
        calls.push('delete');
        return stored;
      }),
      create: vi.fn(createRow),
    },
  };
  const prisma = {
    meetup: {
      findUnique: vi.fn(async () =>
        options.meetupExists === false ? null : { id: MEETUP_ID },
      ),
    },
    // 트랜잭션 밖 create와 안 create를 따로 센다 — 여러 회차 등록이 tx만 쓰는지(전부 또는 없음) 확인하려고
    schedule: {
      create: vi.fn(createRow),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async (): Promise<AdminScheduleRow[]> => []),
      count: vi.fn(async () => 0),
    },
    application: { groupBy: vi.fn(async () => []) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const service = new SchedulesService(
    prisma as unknown as ConstructorParameters<typeof SchedulesService>[0],
    { logger, now },
  );
  return { service, prisma, tx, logger, now, calls };
}

async function errorOf(promise: Promise<unknown>): Promise<ApiHttpException> {
  const error = await promise.catch((e: unknown) => e);
  return error as ApiHttpException;
}

const messageOf = (error: ApiHttpException) =>
  (error.getResponse() as { message: string }).message;

describe('SchedulesService.createBatch (D15)', () => {
  it('reads now once and creates in request order without status, logging each after commit', async () => {
    const { service, prisma, tx, logger, now } = build();
    const items = [input(4), input(11), input(18)];
    const response = await service.createBatch(
      ADMIN,
      MEETUP_ID,
      { items },
      'req-1',
    );

    expect(now).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.schedule.create).not.toHaveBeenCalled();
    const datas = tx.schedule.create.mock.calls.map(([args]) => args.data);
    expect(datas.map((data) => (data.startsAt as Date).toISOString())).toEqual([
      '2026-10-04T05:00:00.000Z',
      '2026-10-11T05:00:00.000Z',
      '2026-10-18T05:00:00.000Z',
    ]);
    for (const data of datas) {
      expect(data).not.toHaveProperty('status');
      expect(data.meetupId).toBe(MEETUP_ID);
    }
    expect(response.items.map((item) => item.startsAt)).toEqual(
      datas.map((data) => (data.startsAt as Date).toISOString()),
    );
    expect(response.items.every((item) => item.status === 'DRAFT')).toBe(true);
    const created = logger.info.mock.calls.filter(
      ([event]) => event === 'schedule.created',
    );
    expect(created).toHaveLength(3);
    expect(created[0]?.[1]).toMatchObject({
      adminId: ADMIN.id,
      meetupId: MEETUP_ID,
      requestId: 'req-1',
    });
  });

  it('rejects the second item on the time rule before any transaction', async () => {
    const { service, prisma } = build();
    const items = [
      input(4),
      input(11, { applyDeadlineAt: '2026-10-11T15:00:00+09:00' }),
      input(18),
    ];
    const error = await errorOf(
      service.createBatch(ADMIN, MEETUP_ID, { items }, 'req'),
    );
    expect(error.getStatus()).toBe(400);
    expect(error.code).toBe(API_ERROR_CODES.SCHEDULE_TIME_INVALID);
    expect(messageOf(error)).toMatch(/^items\.1: /);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<CreateScheduleRequest>]>([
    ['male', { maleMinBirthYear: 1996, maleMaxBirthYear: 1995 }],
    ['female', { femaleMinBirthYear: 1996, femaleMaxBirthYear: 1995 }],
  ])(
    'rejects the third item on the %s birth-year order (D16)',
    async (_label, range) => {
      const { service, prisma } = build();
      const items = [input(4), input(11), input(18, range)];
      const error = await errorOf(
        service.createBatch(ADMIN, MEETUP_ID, { items }, 'req'),
      );
      expect(error.code).toBe(API_ERROR_CODES.BIRTH_YEAR_RANGE_INVALID);
      expect(messageOf(error)).toBe('items.2: 연령대 규칙');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('passes the five revision fields to INSERT as sent (D16 · D17)', async () => {
    const { service, tx } = build();
    const fields = {
      femaleMinBirthYear: 1990,
      femaleMaxBirthYear: 1999,
      participantCondition: '90년대생 직장인',
      priceNote: '커피 1잔 포함',
      minPerGender: 5,
    };
    await service.createBatch(
      ADMIN,
      MEETUP_ID,
      { items: [input(4, fields), input(11)] },
      'req',
    );
    const datas = tx.schedule.create.mock.calls.map(([args]) => args.data);
    expect(datas[0]).toMatchObject(fields);
    expect(datas[1]).not.toHaveProperty('minPerGender');
  });

  it('answers 404 MEETUP_NOT_FOUND before judging any rule', async () => {
    const { service, now } = build({ meetupExists: false });
    const items = [input(4, { applyDeadlineAt: '2026-10-05T00:00:00Z' })];
    const error = await errorOf(
      service.createBatch(ADMIN, MEETUP_ID, { items }, 'req'),
    );
    expect(error.code).toBe(API_ERROR_CODES.MEETUP_NOT_FOUND);
    expect(now).not.toHaveBeenCalled();
  });

  it('propagates a failing third create and logs nothing', async () => {
    const { service, logger } = build({ failCreateAt: 3 });
    await expect(
      service.createBatch(
        ADMIN,
        MEETUP_ID,
        { items: [input(4), input(11), input(18)] },
        'req',
      ),
    ).rejects.toThrow('connection lost');
    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe('SchedulesService — lock first, then judge', () => {
  it('update: FOR UPDATE → read → update, logs changed field names only', async () => {
    const { service, calls, logger, tx } = build();
    await service.update(
      ADMIN,
      MEETUP_ID,
      SCHEDULE_ID,
      { priceMale: 45_000, venueName: 'NEW-SECRET', venueArea: '성수' },
      'req',
    );
    expect(calls[0]).toBe("sql:SET LOCAL lock_timeout = '2s'");
    expect(calls[1]).toContain('FOR UPDATE');
    expect(calls.slice(2)).toEqual(['read', 'update']);
    // venueArea는 같은 값이라 쓰지 않는다
    expect(tx.schedule.update.mock.calls[0]?.[0].data).toEqual({
      priceMale: 45_000,
      venueName: 'NEW-SECRET',
    });
    expect(logger.info).toHaveBeenCalledWith('schedule.updated', {
      adminId: ADMIN.id,
      meetupId: MEETUP_ID,
      scheduleId: SCHEDULE_ID,
      status: 'DRAFT',
      fields: ['priceMale', 'venueName'],
      requestId: 'req',
    });
    expect(loggedText(logger)).not.toContain('SECRET');
    expect(loggedText(logger)).not.toContain('45000');
  });

  it('update: merged birth-year violation (stored max 1995 + min 1996) → 400 without writing', async () => {
    const { service, tx } = build();
    const error = await errorOf(
      service.update(
        ADMIN,
        MEETUP_ID,
        SCHEDULE_ID,
        { maleMinBirthYear: 1996 },
        'req',
      ),
    );
    expect(error.code).toBe(API_ERROR_CODES.BIRTH_YEAR_RANGE_INVALID);
    expect(tx.schedule.update).not.toHaveBeenCalled();
  });

  it('update: merged female birth-year violation (stored min 1990 + max 1985) → 400 with a gender-neutral message', async () => {
    const { service, tx } = build({
      stored: row({ femaleMinBirthYear: 1990 }),
    });
    const error = await errorOf(
      service.update(
        ADMIN,
        MEETUP_ID,
        SCHEDULE_ID,
        { femaleMaxBirthYear: 1985 },
        'req',
      ),
    );
    expect(error.code).toBe(API_ERROR_CODES.BIRTH_YEAR_RANGE_INVALID);
    expect(messageOf(error)).toBe(
      '연령대의 앞 연도가 뒤 연도보다 클 수 없습니다.',
    );
    expect(tx.schedule.update).not.toHaveBeenCalled();
  });

  it('update: logs the revision field names only, not their values (14절)', async () => {
    const { service, logger, tx } = build();
    await service.update(
      ADMIN,
      MEETUP_ID,
      SCHEDULE_ID,
      {
        priceNote: 'NOTE-SECRET',
        participantCondition: 'CONDITION-SECRET',
        minPerGender: 8,
        femaleMinBirthYear: 1991,
        // 저장값과 같다 — 쓰지 않는다
        maleMaxBirthYear: 1995,
      },
      'req',
    );
    expect(tx.schedule.update.mock.calls[0]?.[0].data).toEqual({
      priceNote: 'NOTE-SECRET',
      participantCondition: 'CONDITION-SECRET',
      minPerGender: 8,
      femaleMinBirthYear: 1991,
    });
    expect(logger.info).toHaveBeenCalledWith(
      'schedule.updated',
      expect.objectContaining({
        fields: [
          'priceNote',
          'participantCondition',
          'minPerGender',
          'femaleMinBirthYear',
        ],
      }),
    );
    expect(loggedText(logger)).not.toContain('SECRET');
    expect(loggedText(logger)).not.toContain('1991');
  });

  it('update: CANCELLED → 409 SCHEDULE_NOT_EDITABLE', async () => {
    const { service } = build({
      stored: row({ status: 'CANCELLED', cancelReason: '사유' }),
    });
    const error = await errorOf(
      service.update(ADMIN, MEETUP_ID, SCHEDULE_ID, { priceMale: 1 }, 'req'),
    );
    expect(error.getStatus()).toBe(409);
    expect(error.code).toBe(API_ERROR_CODES.SCHEDULE_NOT_EDITABLE);
  });

  it.each([
    [
      'update',
      (s: SchedulesService) =>
        s.update(ADMIN, MEETUP_ID, SCHEDULE_ID, { priceMale: 1 }, 'r'),
    ],
    [
      'status',
      (s: SchedulesService) =>
        s.updateStatus(ADMIN, MEETUP_ID, SCHEDULE_ID, { status: 'OPEN' }, 'r'),
    ],
    [
      'delete',
      (s: SchedulesService) => s.remove(ADMIN, MEETUP_ID, SCHEDULE_ID, 'r'),
    ],
  ])(
    '%s: a schedule of another meetup → 404 SCHEDULE_NOT_FOUND',
    async (_label, act) => {
      const { service, tx } = build({ locked: false });
      const error = await errorOf(act(service));
      expect(error.code).toBe(API_ERROR_CODES.SCHEDULE_NOT_FOUND);
      expect(tx.schedule.findUniqueOrThrow).not.toHaveBeenCalled();
    },
  );

  it('status: cancel logs from · to without the reason', async () => {
    const { service, calls, logger } = build({
      stored: row({ status: 'OPEN' }),
    });
    const result = await service.updateStatus(
      ADMIN,
      MEETUP_ID,
      SCHEDULE_ID,
      { status: 'CANCELLED', cancelReason: 'SECRET-REASON' },
      'req',
    );
    expect(calls[1]).toContain('FOR UPDATE');
    expect(result.cancelReason).toBe('SECRET-REASON');
    expect(logger.info).toHaveBeenCalledWith('schedule.status_changed', {
      adminId: ADMIN.id,
      meetupId: MEETUP_ID,
      scheduleId: SCHEDULE_ID,
      from: 'OPEN',
      to: 'CANCELLED',
      cancelledApplications: 0,
      requestId: 'req',
    });
    expect(loggedText(logger)).not.toContain('SECRET');
  });

  it('status: the same status is a no-op 200 without update or log', async () => {
    const { service, tx, logger } = build({
      stored: row({ status: 'OPEN' }),
    });
    const result = await service.updateStatus(
      ADMIN,
      MEETUP_ID,
      SCHEDULE_ID,
      { status: 'OPEN' },
      'req',
    );
    expect(result.status).toBe('OPEN');
    expect(tx.schedule.update).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('status: DRAFT → OPEN after the apply deadline → 400 SCHEDULE_TIME_INVALID', async () => {
    const { service } = build({
      stored: row({ applyDeadlineAt: NOW }),
    });
    const error = await errorOf(
      service.updateStatus(
        ADMIN,
        MEETUP_ID,
        SCHEDULE_ID,
        { status: 'OPEN' },
        'req',
      ),
    );
    expect(error.getStatus()).toBe(400);
    expect(error.code).toBe(API_ERROR_CODES.SCHEDULE_TIME_INVALID);
  });

  it('delete: OPEN → 409 SCHEDULE_NOT_EDITABLE, DRAFT → deleted and logged', async () => {
    const open = build({ stored: row({ status: 'OPEN' }) });
    const error = await errorOf(
      open.service.remove(ADMIN, MEETUP_ID, SCHEDULE_ID, 'req'),
    );
    expect(error.code).toBe(API_ERROR_CODES.SCHEDULE_NOT_EDITABLE);
    expect(open.tx.schedule.delete).not.toHaveBeenCalled();

    const draft = build();
    await draft.service.remove(ADMIN, MEETUP_ID, SCHEDULE_ID, 'req');
    expect(draft.calls.slice(2)).toEqual(['read', 'delete']);
    expect(draft.logger.info).toHaveBeenCalledWith('schedule.deleted', {
      adminId: ADMIN.id,
      meetupId: MEETUP_ID,
      scheduleId: SCHEDULE_ID,
      requestId: 'req',
    });
  });

  it('create: missing meetup → 404 MEETUP_NOT_FOUND', async () => {
    const { service } = build({ meetupExists: false });
    const error = await errorOf(
      service.create(ADMIN, MEETUP_ID, input(4), 'req'),
    );
    expect(error.code).toBe(API_ERROR_CODES.MEETUP_NOT_FOUND);
  });
});

describe('SchedulesService — applications on the schedule side (SPEC-003 D8)', () => {
  it('update: a capacity change counts seated applications (not received ones) after the lock', async () => {
    const { service, calls, tx } = build({
      stored: row({ status: 'OPEN' }),
      seated: { MALE: 3 },
    });
    await service.update(
      ADMIN,
      MEETUP_ID,
      SCHEDULE_ID,
      { capacityMale: 3 },
      'req',
    );
    expect(calls.slice(0, 4)).toEqual([
      "sql:SET LOCAL lock_timeout = '2s'",
      expect.stringContaining('FOR UPDATE'),
      'read',
      'count:MALE',
    ]);
    expect(tx.application.count).toHaveBeenCalledWith({
      where: {
        scheduleId: SCHEDULE_ID,
        gender: 'MALE',
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });
    expect(tx.schedule.update).toHaveBeenCalled();
  });

  it.each([
    ['capacityMale', 'MALE'],
    ['capacityFemale', 'FEMALE'],
  ] as const)(
    'update: %s below the seated count → 409 CAPACITY_BELOW_APPLICATIONS without writing',
    async (field, gender) => {
      const { service, tx } = build({
        stored: row({ status: 'OPEN' }),
        seated: { [gender]: 3 },
      });
      const error = await errorOf(
        service.update(ADMIN, MEETUP_ID, SCHEDULE_ID, { [field]: 2 }, 'req'),
      );
      expect(error.getStatus()).toBe(409);
      expect(error.code).toBe(API_ERROR_CODES.CAPACITY_BELOW_APPLICATIONS);
      expect(tx.schedule.update).not.toHaveBeenCalled();
    },
  );

  it('update: a change without capacity does not count applications', async () => {
    const { service, tx } = build({ stored: row({ status: 'OPEN' }) });
    await service.update(
      ADMIN,
      MEETUP_ID,
      SCHEDULE_ID,
      { priceMale: 45_000 },
      'req',
    );
    expect(tx.application.count).not.toHaveBeenCalled();
  });

  it('status: → CANCELLED cancels the active applications (received included) in the same transaction and logs the count', async () => {
    const { service, calls, tx, logger } = build({
      stored: row({ status: 'OPEN' }),
      cancelled: 4,
    });
    await service.updateStatus(
      ADMIN,
      MEETUP_ID,
      SCHEDULE_ID,
      { status: 'CANCELLED', cancelReason: '사유' },
      'req',
    );
    expect(calls.slice(3)).toEqual(['update', 'cancelApplications']);
    expect(tx.application.updateMany).toHaveBeenCalledWith({
      where: { scheduleId: SCHEDULE_ID, status: { not: 'CANCELLED' } },
      data: { status: 'CANCELLED', cancelledBy: 'SCHEDULE' },
    });
    expect(logger.info).toHaveBeenCalledWith(
      'schedule.status_changed',
      expect.objectContaining({ cancelledApplications: 4 }),
    );
  });

  it('status: OPEN → CLOSED leaves applications alone and logs no count', async () => {
    const { service, tx, logger } = build({ stored: row({ status: 'OPEN' }) });
    await service.updateStatus(
      ADMIN,
      MEETUP_ID,
      SCHEDULE_ID,
      { status: 'CLOSED' },
      'req',
    );
    expect(tx.application.updateMany).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('schedule.status_changed', {
      adminId: ADMIN.id,
      meetupId: MEETUP_ID,
      scheduleId: SCHEDULE_ID,
      from: 'OPEN',
      to: 'CLOSED',
      requestId: 'req',
    });
  });

  // PrismaPg가 올리는 잠금 대기 상한 초과의 모양(meta.driverAdapterError.cause.originalCode)
  const lockTimeout = Object.assign(new Error('lock timeout'), {
    code: 'P2010',
    meta: { driverAdapterError: { cause: { originalCode: '55P03' } } },
  });

  it.each([
    [
      'update',
      (s: SchedulesService) =>
        s.update(ADMIN, MEETUP_ID, SCHEDULE_ID, { priceMale: 1 }, 'r'),
    ],
    [
      'status',
      (s: SchedulesService) =>
        s.updateStatus(ADMIN, MEETUP_ID, SCHEDULE_ID, { status: 'OPEN' }, 'r'),
    ],
    [
      'delete',
      (s: SchedulesService) => s.remove(ADMIN, MEETUP_ID, SCHEDULE_ID, 'r'),
    ],
  ])(
    '%s: waiting past the lock timeout (55P03) → 503 SERVICE_BUSY + schedule.busy',
    async (_label, act) => {
      const { service, logger } = build({ lockError: lockTimeout });
      const error = await errorOf(act(service));
      expect(error.getStatus()).toBe(503);
      expect(error.code).toBe(API_ERROR_CODES.SERVICE_BUSY);
      expect(logger.warn).toHaveBeenCalledWith('schedule.busy', {
        meetupId: MEETUP_ID,
        scheduleId: SCHEDULE_ID,
        cause: 'lock_timeout',
        requestId: 'r',
      });
    },
  );

  it('batch: a transaction that cannot get a connection (P2028) → 503 + schedule.busy cause pool', async () => {
    const { service, prisma, logger } = build();
    prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('Unable to start a transaction'), {
        code: 'P2028',
      }),
    );
    const error = await errorOf(
      service.createBatch(ADMIN, MEETUP_ID, { items: [input(4)] }, 'r'),
    );
    expect(error.getStatus()).toBe(503);
    expect(error.code).toBe(API_ERROR_CODES.SERVICE_BUSY);
    expect(logger.warn).toHaveBeenCalledWith('schedule.busy', {
      meetupId: MEETUP_ID,
      cause: 'pool',
      requestId: 'r',
    });
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('other DB errors are not turned into 503', async () => {
    const { service, logger } = build({
      lockError: Object.assign(new Error('check'), {
        code: 'P2010',
        meta: { driverAdapterError: { cause: { originalCode: '23514' } } },
      }),
    });
    const error = await errorOf(
      service.update(ADMIN, MEETUP_ID, SCHEDULE_ID, { priceMale: 1 }, 'r'),
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as unknown as { code: string }).code).toBe('P2010');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('get: the response carries the six seat values from one groupBy — received rows do not fill seats', async () => {
    const { service, prisma } = build({ stored: row({ status: 'OPEN' }) });
    prisma.schedule.findFirst.mockResolvedValueOnce(
      row({ status: 'OPEN', capacityMale: 2 }) as never,
    );
    prisma.application.groupBy.mockResolvedValueOnce([
      {
        scheduleId: SCHEDULE_ID,
        gender: 'MALE',
        status: 'PENDING',
        _count: { _all: 2 },
      },
      {
        scheduleId: SCHEDULE_ID,
        gender: 'MALE',
        status: 'APPLIED',
        _count: { _all: 3 },
      },
      {
        scheduleId: SCHEDULE_ID,
        gender: 'FEMALE',
        status: 'CONFIRMED',
        _count: { _all: 1 },
      },
    ] as never);
    const detail = await service.get(MEETUP_ID, SCHEDULE_ID);
    expect(detail).toMatchObject({
      appliedMale: 2,
      appliedFemale: 1,
      receivedMale: 3,
      receivedFemale: 0,
      maleFull: true,
      femaleFull: false,
    });
    expect(prisma.application.groupBy).toHaveBeenCalledWith({
      by: ['scheduleId', 'gender', 'status'],
      where: {
        scheduleId: { in: [SCHEDULE_ID] },
        status: { not: 'CANCELLED' },
      },
      _count: { _all: true },
    });
  });

  it('list: maps each schedule to its own counts, zero for a gender without applications', async () => {
    const OTHER_ID = '3b241101-e2bb-4255-8caf-4136c566a962';
    const { service, prisma } = build();
    prisma.schedule.findMany.mockResolvedValueOnce([
      row({ id: SCHEDULE_ID, status: 'OPEN', capacityMale: 2 }),
      row({ id: OTHER_ID, status: 'OPEN', capacityFemale: 1 }),
    ]);
    prisma.schedule.count.mockResolvedValueOnce(2);
    prisma.application.groupBy.mockResolvedValueOnce([
      {
        scheduleId: SCHEDULE_ID,
        gender: 'MALE',
        status: 'PENDING',
        _count: { _all: 2 },
      },
      {
        scheduleId: OTHER_ID,
        gender: 'FEMALE',
        status: 'PENDING',
        _count: { _all: 1 },
      },
      {
        scheduleId: OTHER_ID,
        gender: 'MALE',
        status: 'APPLIED',
        _count: { _all: 4 },
      },
    ] as never);

    const list = await service.list(MEETUP_ID, { page: 1, pageSize: 20 });

    expect(list.items.map((item) => item.id)).toEqual([SCHEDULE_ID, OTHER_ID]);
    expect(list.items[0]).toMatchObject({
      appliedMale: 2,
      appliedFemale: 0,
      receivedMale: 0,
      receivedFemale: 0,
      maleFull: true,
      femaleFull: false,
    });
    expect(list.items[1]).toMatchObject({
      appliedMale: 0,
      appliedFemale: 1,
      receivedMale: 4,
      receivedFemale: 0,
      maleFull: false,
      femaleFull: true,
    });
    expect(prisma.application.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.application.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scheduleId: { in: [SCHEDULE_ID, OTHER_ID] },
          status: { not: 'CANCELLED' },
        },
      }),
    );
  });
});
