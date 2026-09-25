import { randomUUID } from 'node:crypto';
import {
  API_ERROR_CODES,
  type AdminSchedule,
  type MyApplication,
} from '@oneul-sai/contracts';
import { inject } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  codeOf,
  scheduleInput,
  TestApp,
  type ApiResult,
  type Caller,
} from '../testing/integration-app.js';

// SPEC-003 13절 통합 — 동시성. **순서를 강제해 증명한다(D13)**: 앱 밖의 연결(`outside`, psql 세션 같은 것)이
// 회차 행을 FOR UPDATE로 쥔 채 요청을 보내고, pg_locks로 요청이 실제로 기다리는지 확인한 뒤, 그 트랜잭션에서
// 상태를 바꿔 커밋한다. count를 잠금 문장의 서브쿼리에 넣거나 회차 · now를 잠금 전에 읽는 구현은 반드시 실패한다.
// 요청은 8개 — 앱 연결 풀(10)보다 작게.

let t: TestApp;
let outside: PrismaService;

beforeAll(async () => {
  t = await TestApp.start();
  outside = new PrismaService(inject('testDatabaseUrl'));
});
beforeEach(() => t.reset());
afterAll(async () => {
  await outside.$disconnect();
  await t.close();
});

const WAITERS = 8;

const apply = (caller: Caller, scheduleId: string) =>
  t.call({
    method: 'POST',
    path: '/api/v1/applications',
    body: { scheduleId },
    user: caller,
  });

async function openSchedule(capacityMale = 7, capacityFemale = 7) {
  const meetup = await t.createMeetup();
  return t.openSchedule(
    meetup.id,
    scheduleInput({ capacityMale, capacityFemale }),
  );
}

/** 테스트가 DB에 직접 넣는 활성 신청(다른 회원들). */
async function seedActive(
  scheduleId: string,
  gender: 'MALE' | 'FEMALE',
  n: number,
) {
  await t.prisma.application.createMany({
    data: Array.from({ length: n }, () => ({
      scheduleId,
      memberId: randomUUID(),
      gender,
      price: 0,
    })),
  });
}

const activeCount = (scheduleId: string, gender: 'MALE' | 'FEMALE') =>
  t.prisma.application.count({
    where: { scheduleId, gender, status: { not: 'CANCELLED' } },
  });

async function waitForLockWaiters(count: number): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const [row] = await outside.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting
      FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE NOT l.granted AND a.datname = current_database()`;
    if ((row?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`lock waiters did not reach ${count}`);
}

/**
 * 앱 밖에서 회차 행을 쥔 채 `requests`를 보내고, 모두 기다리는 것을 확인한 뒤 `change`를 하고 커밋한다.
 * 잠금 대기 상한(2초)보다 먼저 커밋한다.
 */
async function whileHolding(
  scheduleId: string,
  requests: () => Promise<ApiResult>[],
  change: (
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  ) => Promise<unknown>,
): Promise<ApiResult[]> {
  let pending: Promise<ApiResult>[] = [];
  await outside.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Schedule" WHERE "id" = ${scheduleId} FOR UPDATE`;
      pending = requests();
      await waitForLockWaiters(pending.length);
      await change(tx);
    },
    { timeout: 10_000 },
  );
  return Promise.all(pending);
}

const men = (n: number) =>
  Array.from({ length: n }, (_, i) => t.members.add('MALE', 1990 + (i % 5)));

function expectAll(results: ApiResult[], status: number, code: string) {
  for (const result of results) {
    expect({ status: result.status, code: codeOf(result) }).toEqual({
      status,
      code,
    });
  }
}

describe('ordering forced (integration, 11절)', () => {
  it('last seat: a seventh application committed while 8 wait → all 8 get 409 SCHEDULE_FULL', async () => {
    const s = await openSchedule(7);
    await seedActive(s.id, 'MALE', 6);
    const callers = men(WAITERS);

    const results = await whileHolding(
      s.id,
      () => callers.map((caller) => apply(caller, s.id)),
      (tx) =>
        tx.application.create({
          data: {
            scheduleId: s.id,
            memberId: randomUUID(),
            gender: 'MALE',
            price: 0,
          },
        }),
    );

    expectAll(results, 409, API_ERROR_CODES.SCHEDULE_FULL);
    expect(await activeCount(s.id, 'MALE')).toBe(7);
  });

  it('capacity shrink: capacity cut to the active count while 8 wait → all 8 get 409 SCHEDULE_FULL', async () => {
    const s = await openSchedule(7);
    await seedActive(s.id, 'MALE', 6);
    const callers = men(WAITERS);

    const results = await whileHolding(
      s.id,
      () => callers.map((caller) => apply(caller, s.id)),
      (tx) =>
        tx.schedule.update({ where: { id: s.id }, data: { capacityMale: 6 } }),
    );

    expectAll(results, 409, API_ERROR_CODES.SCHEDULE_FULL);
    expect(await activeCount(s.id, 'MALE')).toBe(6);
  });

  it('closing: CLOSED committed while 8 wait → all 8 get 409 APPLICATION_CLOSED', async () => {
    const s = await openSchedule(7);
    const callers = men(WAITERS);

    const results = await whileHolding(
      s.id,
      () => callers.map((caller) => apply(caller, s.id)),
      (tx) =>
        tx.schedule.update({ where: { id: s.id }, data: { status: 'CLOSED' } }),
    );

    expectAll(results, 409, API_ERROR_CODES.APPLICATION_CLOSED);
    expect(await activeCount(s.id, 'MALE')).toBe(0);
  });

  it('deadline: the apply deadline passes while 8 wait (nothing changed) → all 8 get 409 APPLICATION_CLOSED', async () => {
    const s = await openSchedule(7);
    const deadline = new Date(Date.now() + 500);
    await t.prisma.schedule.update({
      where: { id: s.id },
      data: { applyDeadlineAt: deadline },
    });
    const callers = men(WAITERS);

    const results = await whileHolding(
      s.id,
      () => callers.map((caller) => apply(caller, s.id)),
      async () => {
        // 8건이 마감 전에 줄을 섰어야 이 테스트가 뜻이 있다 — 느린 러너면 조용히 통과하지 않고 실패한다
        expect(Date.now()).toBeLessThan(deadline.getTime());
        // now를 잠금 뒤에 읽는 구현만 마감 뒤로 판정한다
        const left = deadline.getTime() - Date.now() + 200;
        if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
      },
    );

    expectAll(results, 409, API_ERROR_CODES.APPLICATION_CLOSED);
  });
});

describe('lock wait limit (integration, D3)', () => {
  it('a row held past the lock wait: 8 applications and 1 PATCH get 503 + Retry-After, then the pool recovers', async () => {
    const s = await openSchedule(7);
    const callers = men(WAITERS);
    let pending: Promise<ApiResult>[] = [];

    await outside.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Schedule" WHERE "id" = ${s.id} FOR UPDATE`;
        pending = [
          ...callers.map((caller) => apply(caller, s.id)),
          t.admin('PATCH', `/api/v1/meetups/${s.meetupId}/schedules/${s.id}`, {
            priceMale: 45_000,
          }),
        ];
        // 9개가 모두 줄을 선 뒤 4.5초 쥔다. lock_timeout은 잠금을 얻으려 할 때마다 따로 걸리고, 같은 행의
        // FOR UPDATE는 튜플 잠금 → 쥔 트랜잭션 순서로 두 번 기다린다 — 앞 요청이 포기해 튜플 잠금을 넘겨받은 요청은
        // 2초를 새로 센다. 그래서 한 요청의 최대 대기는 약 4초다(SPEC-003 17절)
        await waitForLockWaiters(pending.length);
        await tx.$executeRaw`SELECT pg_sleep(4.5)`;
      },
      { timeout: 15_000 },
    );
    const results = await Promise.all(pending);

    for (const result of results) {
      expect(result.status).toBe(503);
      expect(codeOf(result)).toBe(API_ERROR_CODES.SERVICE_BUSY);
      expect(result.headers.get('retry-after')).toBe('1');
    }
    expect(await t.prisma.application.count()).toBe(0);

    const after = await apply(t.members.add('MALE', 1994), s.id);
    expect(after.status).toBe(201);
    expect(
      (await t.call({ method: 'GET', path: '/api/v1/events' })).status,
    ).toBe(200);
  });
});

describe('rush (integration, 1절 목표)', () => {
  it('20 men at once for the last male seat → exactly one 201, no 500, the rest 409 or 503', async () => {
    const s = await openSchedule(7);
    await seedActive(s.id, 'MALE', 6);

    const results = await Promise.all(
      men(20).map((caller) => apply(caller, s.id)),
    );

    const statuses = results.map((result) => result.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(
      statuses.filter((status) => status >= 500 && status !== 503),
    ).toHaveLength(0);
    for (const result of results.filter((r) => r.status !== 201)) {
      expect([
        API_ERROR_CODES.SCHEDULE_FULL,
        API_ERROR_CODES.SERVICE_BUSY,
      ]).toContain(codeOf(result));
    }
    // 느린 CI에서 연결 대기로 503이 날 수 있다 — 개수는 기대하지 않고 남긴다
    process.stdout.write(
      `rush: 503 × ${statuses.filter((status) => status === 503).length}\n`,
    );
    expect(await activeCount(s.id, 'MALE')).toBe(7);
  });

  it('3 free seats and 8 men → three 201 and five 409', async () => {
    const s = await openSchedule(7);
    await seedActive(s.id, 'MALE', 4);

    const results = await Promise.all(
      men(WAITERS).map((caller) => apply(caller, s.id)),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expectAll(
      results.filter((r) => r.status !== 201),
      409,
      API_ERROR_CODES.SCHEDULE_FULL,
    );
    expect(await activeCount(s.id, 'MALE')).toBe(7);
  });

  it('one seat per gender, 4 men and 4 women at once → one of each; a full side does not block the other', async () => {
    const s = await openSchedule(7, 7);
    await seedActive(s.id, 'MALE', 6);
    await seedActive(s.id, 'FEMALE', 6);
    const women = Array.from({ length: 4 }, () =>
      t.members.add('FEMALE', 1996),
    );

    const results = await Promise.all([
      ...men(4).map((caller) => apply(caller, s.id)),
      ...women.map((caller) => apply(caller, s.id)),
    ]);

    const created = results.filter((r) => r.status === 201);
    expect(created).toHaveLength(2);
    expect(await activeCount(s.id, 'MALE')).toBe(7);
    expect(await activeCount(s.id, 'FEMALE')).toBe(7);
  });

  it('the same member 8 times at once → one 201, seven 409 ALREADY_APPLIED, one row', async () => {
    const s = await openSchedule(7);
    const man = t.members.add('MALE', 1994);

    const results = await Promise.all(
      Array.from({ length: WAITERS }, () => apply(man, s.id)),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expectAll(
      results.filter((r) => r.status !== 201),
      409,
      API_ERROR_CODES.ALREADY_APPLIED,
    );
    expect(
      await t.prisma.application.count({ where: { memberId: man.id } }),
    ).toBe(1);
  });

  it('cancelling a schedule while someone applies → never an active application on a cancelled schedule', async () => {
    const s: AdminSchedule = await openSchedule(7);
    const man = t.members.add('MALE', 1994);

    const [cancel, applied] = await Promise.all([
      t.admin(
        'PATCH',
        `/api/v1/meetups/${s.meetupId}/schedules/${s.id}/status`,
        {
          status: 'CANCELLED',
          cancelReason: '장소 사정',
        },
      ),
      apply(man, s.id),
    ]);

    expect(cancel.status).toBe(200);
    if (applied.status === 201) {
      const row = await t.prisma.application.findUniqueOrThrow({
        where: { id: (applied.body as MyApplication).id },
      });
      expect(row).toMatchObject({
        status: 'CANCELLED',
        cancelledBy: 'SCHEDULE',
      });
    } else {
      expect(applied.status).toBe(404);
      expect(codeOf(applied)).toBe(API_ERROR_CODES.SCHEDULE_NOT_FOUND);
    }
    expect(await activeCount(s.id, 'MALE')).toBe(0);
  });
});
