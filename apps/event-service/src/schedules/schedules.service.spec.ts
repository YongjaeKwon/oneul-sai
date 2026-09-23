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
    maleMinBirthYear: null,
    maleMaxBirthYear: 1995,
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
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      calls.push(`lock:${strings.join('?')}`);
      return options.locked === false ? [] : [{ id: stored.id }];
    }),
    schedule: {
      findUniqueOrThrow: vi.fn(async () => {
        calls.push('read');
        return stored;
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        calls.push('update');
        return { ...stored, ...data };
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
    },
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

  it('rejects the third item on the male birth-year order', async () => {
    const { service, prisma } = build();
    const items = [
      input(4),
      input(11),
      input(18, { maleMinBirthYear: 1996, maleMaxBirthYear: 1995 }),
    ];
    const error = await errorOf(
      service.createBatch(ADMIN, MEETUP_ID, { items }, 'req'),
    );
    expect(error.code).toBe(API_ERROR_CODES.BIRTH_YEAR_RANGE_INVALID);
    expect(messageOf(error)).toMatch(/^items\.2: /);
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
    expect(calls[0]).toContain('FOR UPDATE');
    expect(calls.slice(1)).toEqual(['read', 'update']);
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
    expect(calls[0]).toContain('FOR UPDATE');
    expect(result.cancelReason).toBe('SECRET-REASON');
    expect(logger.info).toHaveBeenCalledWith('schedule.status_changed', {
      adminId: ADMIN.id,
      meetupId: MEETUP_ID,
      scheduleId: SCHEDULE_ID,
      from: 'OPEN',
      to: 'CANCELLED',
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
    expect(draft.calls.slice(1)).toEqual(['read', 'delete']);
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
