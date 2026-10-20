import { randomUUID } from 'node:crypto';
import {
  API_ERROR_CODES,
  type AdminSchedule,
  type AdminScheduleListResponse,
  type BatchCreateSchedulesResponse,
} from '@oneul-sai/contracts';
import {
  codeOf,
  scheduleInput,
  TestApp,
  type ApiResult,
} from '../testing/integration-app.js';

// SPEC-003 13절 통합(회차 쪽, 개정 2026-10-14): 정원 축소 409(자리 잡은 수 기준 — 접수는 세지 않는다), 회차 취소 연쇄(접수 포함),
// 회원 취소와 회차 취소의 순서 강제, 잠금 대기 상한(PATCH), 운영자 응답의 여섯 값 · 공개 응답에 신청 관련 값 없음(★S2).
// 신청 행은 테스트가 DB에 직접 넣는다 — 상태를 고르기 위해서다.

let t: TestApp;

beforeAll(async () => {
  t = await TestApp.start();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Gender = 'MALE' | 'FEMALE';
type Status = 'APPLIED' | 'PENDING' | 'CONFIRMED' | 'CANCELLED';

function insertApplication(
  scheduleId: string,
  gender: Gender,
  status: Status = 'PENDING',
  cancelledBy: 'MEMBER' | null = status === 'CANCELLED' ? 'MEMBER' : null,
) {
  return t.prisma.application.create({
    data: {
      scheduleId,
      memberId: randomUUID(),
      gender,
      price: 39_000,
      status,
      cancelledBy,
    },
  });
}

const schedulePath = (s: Pick<AdminSchedule, 'id' | 'meetupId'>) =>
  `/api/v1/meetups/${s.meetupId}/schedules/${s.id}`;

const SIX_ZERO = {
  appliedMale: 0,
  appliedFemale: 0,
  receivedMale: 0,
  receivedFemale: 0,
  maleFull: false,
  femaleFull: false,
};

/** 이 DB에서 잠금을 기다리는 연결이 `count`개가 될 때까지 기다린다(요청이 실제로 줄을 섰다는 증거, D13). */
async function waitForLockWaiters(count: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [row] = await t.prisma.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting
      FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE NOT l.granted AND a.datname = current_database()`;
    if ((row?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`lock waiters did not reach ${count}`);
}

describe('schedule side of applications (integration, SPEC-003 D8 · D17)', () => {
  it('capacity: below the seated count → 409, equal → 200 with the six values; received applications are not counted', async () => {
    const meetup = await t.createMeetup();
    const schedule = await t.openSchedule(meetup.id);
    // 자리 잡은 남성 2(입금 대기 · 참가 확정) · 접수 남성 3 · 취소 1, 자리 잡은 여성 1
    await insertApplication(schedule.id, 'MALE', 'PENDING');
    await insertApplication(schedule.id, 'MALE', 'CONFIRMED');
    for (let i = 0; i < 3; i += 1) {
      await insertApplication(schedule.id, 'MALE', 'APPLIED');
    }
    await insertApplication(schedule.id, 'MALE', 'CANCELLED');
    await insertApplication(schedule.id, 'FEMALE', 'PENDING');

    const below = await t.admin('PATCH', schedulePath(schedule), {
      capacityMale: 1,
    });
    expect(below.status).toBe(409);
    expect(codeOf(below)).toBe(API_ERROR_CODES.CAPACITY_BELOW_APPLICATIONS);

    // 접수를 세면 5 > 2라 409가 날 입력 — 자리 잡은 수만 세므로 200
    const equal = await t.admin('PATCH', schedulePath(schedule), {
      capacityMale: 2,
    });
    expect(equal.status).toBe(200);
    const expected = {
      capacityMale: 2,
      appliedMale: 2,
      receivedMale: 3,
      maleFull: true,
      appliedFemale: 1,
      receivedFemale: 0,
      femaleFull: false,
    };
    expect(equal.body).toMatchObject(expected);

    // 목록 · 상세도 같은 값을 싣는다
    const detail = await t.admin('GET', schedulePath(schedule));
    expect(detail.body).toMatchObject(expected);
    const list = await t.admin('GET', `/api/v1/meetups/${meetup.id}/schedules`);
    expect((list.body as AdminScheduleListResponse).items[0]).toMatchObject(
      expected,
    );

    // 공개 응답에는 신청 관련 값이 없다(★S2) — 목록 · 상세 모두
    for (const path of ['/api/v1/events', `/api/v1/events/${schedule.id}`]) {
      const open = await t.call({ method: 'GET', path });
      expect(open.status).toBe(200);
      for (const key of ['maleFull', 'femaleFull', 'applied', 'received']) {
        expect(open.text).not.toContain(key);
      }
    }
  });

  it('new schedules carry zero counts (single and batch)', async () => {
    const meetup = await t.createMeetup();
    const single = await t.createSchedule(meetup.id);
    expect(single).toMatchObject(SIX_ZERO);
    const batch = await t.admin(
      'POST',
      `/api/v1/meetups/${meetup.id}/schedules/batch`,
      { items: [scheduleInput({}, 14)] },
    );
    expect((batch.body as BatchCreateSchedulesResponse).items[0]).toMatchObject(
      SIX_ZERO,
    );
  });

  it('cancelling a schedule cancels received · invited · confirmed applications as SCHEDULE and leaves cancelled ones alone', async () => {
    const meetup = await t.createMeetup();
    const schedule = await t.openSchedule(meetup.id);
    const received = await insertApplication(schedule.id, 'MALE', 'APPLIED');
    const invited = await insertApplication(schedule.id, 'FEMALE', 'PENDING');
    const confirmed = await insertApplication(schedule.id, 'MALE', 'CONFIRMED');
    const earlier = await insertApplication(schedule.id, 'MALE', 'CANCELLED');

    const cancelled = await t.setStatus(schedule, 'CANCELLED', '장소 사정');
    expect(cancelled).toMatchObject({ status: 'CANCELLED', ...SIX_ZERO });

    const rows = await t.prisma.application.findMany({
      where: { scheduleId: schedule.id },
      select: { id: true, status: true, cancelledBy: true, updatedAt: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const id of [received.id, invited.id, confirmed.id]) {
      expect(byId.get(id)).toMatchObject({
        status: 'CANCELLED',
        cancelledBy: 'SCHEDULE',
      });
    }
    expect(byId.get(earlier.id)).toMatchObject({
      cancelledBy: 'MEMBER',
      updatedAt: earlier.updatedAt,
    });
  });

  it('a member cancel that holds the row wins; the schedule cancel waits and skips it (ordering forced, 11절)', async () => {
    const meetup = await t.createMeetup();
    const schedule = await t.openSchedule(meetup.id);
    const held = await insertApplication(schedule.id, 'MALE', 'PENDING');
    const other = await insertApplication(schedule.id, 'FEMALE', 'APPLIED');
    const memberCancelledAt = new Date('2030-01-01T00:00:00.000Z');

    let request: Promise<ApiResult> | undefined;
    await t.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Application" WHERE "id" = ${held.id} FOR UPDATE`;
        request = t.admin('PATCH', `${schedulePath(schedule)}/status`, {
          status: 'CANCELLED',
          cancelReason: '장소 사정',
        });
        // 회차 취소가 이 행에서 실제로 기다린다 — 잠금 대기 상한(2초)보다 먼저 커밋한다
        await waitForLockWaiters(1);
        await tx.application.update({
          where: { id: held.id },
          data: {
            status: 'CANCELLED',
            cancelledBy: 'MEMBER',
            updatedAt: memberCancelledAt,
          },
        });
      },
      { timeout: 10_000 },
    );

    const result = await request;
    expect(result?.status).toBe(200);
    const rows = await t.prisma.application.findMany({
      where: { scheduleId: schedule.id },
      select: { id: true, cancelledBy: true, updatedAt: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(held.id)).toEqual({
      id: held.id,
      cancelledBy: 'MEMBER',
      updatedAt: memberCancelledAt,
    });
    expect(byId.get(other.id)?.cancelledBy).toBe('SCHEDULE');
  });

  it('a PATCH waiting on a row held past the lock timeout gets 503 SERVICE_BUSY + Retry-After, then the pool recovers', async () => {
    const meetup = await t.createMeetup();
    const schedule = await t.openSchedule(meetup.id);

    let patch: Promise<ApiResult> | undefined;
    await t.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Schedule" WHERE "id" = ${schedule.id} FOR UPDATE`;
        patch = t.admin('PATCH', schedulePath(schedule), {
          priceMale: 45_000,
        });
        await waitForLockWaiters(1);
        // lock_timeout(2초)보다 오래 쥔다
        await tx.$executeRaw`SELECT pg_sleep(3)`;
      },
      { timeout: 10_000 },
    );

    const busy = await patch;
    expect(busy?.status).toBe(503);
    expect(busy && codeOf(busy)).toBe(API_ERROR_CODES.SERVICE_BUSY);
    expect(busy?.headers.get('retry-after')).toBe('1');

    // 잠금이 풀리면 같은 요청이 된다 · 공개 목록도 그대로 돈다
    const after = await t.admin('PATCH', schedulePath(schedule), {
      priceMale: 45_000,
    });
    expect(after.status).toBe(200);
    const events = await t.call({ method: 'GET', path: '/api/v1/events' });
    expect(events.status).toBe(200);
  });
});
