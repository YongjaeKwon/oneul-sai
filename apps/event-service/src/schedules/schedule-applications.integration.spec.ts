import { randomUUID } from 'node:crypto';
import {
  API_ERROR_CODES,
  type AdminSchedule,
  type AdminScheduleListResponse,
  type BatchCreateSchedulesResponse,
  type PublicSchedule,
} from '@oneul-sai/contracts';
import {
  codeOf,
  scheduleInput,
  TestApp,
  type ApiResult,
} from '../testing/integration-app.js';

// SPEC-003 13절 통합(5a — 회차 쪽): 정원 축소 409, 회차 취소 연쇄, 회원 취소와 회차 취소의 순서 강제,
// 잠금 대기 상한(PATCH), 운영자 · 공개 응답의 신청 수 값. 신청 API는 아직 없어 신청 행은 테스트가 DB에 직접 넣는다.

let t: TestApp;

beforeAll(async () => {
  t = await TestApp.start();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

type Gender = 'MALE' | 'FEMALE';

function insertApplication(
  scheduleId: string,
  gender: Gender,
  overrides: { status?: 'PENDING' | 'CANCELLED'; cancelledBy?: 'MEMBER' } = {},
) {
  return t.prisma.application.create({
    data: {
      scheduleId,
      memberId: randomUUID(),
      gender,
      price: 39_000,
      status: overrides.status ?? 'PENDING',
      cancelledBy: overrides.cancelledBy ?? null,
    },
  });
}

const schedulePath = (s: Pick<AdminSchedule, 'id' | 'meetupId'>) =>
  `/api/v1/meetups/${s.meetupId}/schedules/${s.id}`;

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

describe('schedule side of applications (integration, SPEC-003 D8 · D10)', () => {
  it('capacity: below the active count → 409, equal → 200 with the four seat values', async () => {
    const meetup = await t.createMeetup();
    const schedule = await t.openSchedule(meetup.id);
    for (let i = 0; i < 3; i += 1) await insertApplication(schedule.id, 'MALE');
    await insertApplication(schedule.id, 'MALE', {
      status: 'CANCELLED',
      cancelledBy: 'MEMBER',
    });
    await insertApplication(schedule.id, 'FEMALE');

    const below = await t.admin('PATCH', schedulePath(schedule), {
      capacityMale: 2,
    });
    expect(below.status).toBe(409);
    expect(codeOf(below)).toBe(API_ERROR_CODES.CAPACITY_BELOW_APPLICATIONS);

    const equal = await t.admin('PATCH', schedulePath(schedule), {
      capacityMale: 3,
    });
    expect(equal.status).toBe(200);
    expect(equal.body).toMatchObject({
      capacityMale: 3,
      appliedMale: 3,
      appliedFemale: 1,
      maleFull: true,
      femaleFull: false,
    });

    // 목록 · 상세도 같은 값을 싣는다
    const detail = await t.admin('GET', schedulePath(schedule));
    expect(detail.body).toMatchObject({ appliedMale: 3, maleFull: true });
    const list = await t.admin('GET', `/api/v1/meetups/${meetup.id}/schedules`);
    expect((list.body as AdminScheduleListResponse).items[0]).toMatchObject({
      appliedMale: 3,
      appliedFemale: 1,
      maleFull: true,
    });

    // 공개 응답은 마감 여부만 — 숫자는 없다
    const open = await t.call({
      method: 'GET',
      path: `/api/v1/events/${schedule.id}`,
    });
    expect(open.body).toMatchObject({ maleFull: true, femaleFull: false });
    expect(open.body as PublicSchedule).not.toHaveProperty('appliedMale');
    expect(open.text).not.toContain('appliedFemale');
  });

  it('new schedules carry zero counts (single and batch)', async () => {
    const meetup = await t.createMeetup();
    const single = await t.createSchedule(meetup.id);
    expect(single).toMatchObject({
      appliedMale: 0,
      appliedFemale: 0,
      maleFull: false,
      femaleFull: false,
    });
    const batch = await t.admin(
      'POST',
      `/api/v1/meetups/${meetup.id}/schedules/batch`,
      { items: [scheduleInput({}, 14)] },
    );
    expect((batch.body as BatchCreateSchedulesResponse).items[0]).toMatchObject(
      { appliedMale: 0, appliedFemale: 0, maleFull: false, femaleFull: false },
    );
  });

  it('cancelling a schedule cancels its active applications as SCHEDULE and leaves cancelled ones alone', async () => {
    const meetup = await t.createMeetup();
    const schedule = await t.openSchedule(meetup.id);
    const male = await insertApplication(schedule.id, 'MALE');
    const female = await insertApplication(schedule.id, 'FEMALE');
    const earlier = await insertApplication(schedule.id, 'MALE', {
      status: 'CANCELLED',
      cancelledBy: 'MEMBER',
    });

    const cancelled = await t.setStatus(schedule, 'CANCELLED', '장소 사정');
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      appliedMale: 0,
      appliedFemale: 0,
      maleFull: false,
      femaleFull: false,
    });

    const rows = await t.prisma.application.findMany({
      where: { scheduleId: schedule.id },
      select: { id: true, status: true, cancelledBy: true, updatedAt: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const id of [male.id, female.id]) {
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
    const held = await insertApplication(schedule.id, 'MALE');
    const other = await insertApplication(schedule.id, 'FEMALE');
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
