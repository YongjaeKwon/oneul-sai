import { randomUUID } from 'node:crypto';
import {
  API_ERROR_CODES,
  type AdminApplication,
  type AdminApplicationListResponse,
  type AdminSchedule,
  type ApiErrorResponse,
  type MyApplication,
  type MyApplicationListResponse,
  type PublicSchedule,
} from '@oneul-sai/contracts';
import {
  ADMIN,
  addMinutes,
  codeOf,
  scheduleInput,
  TestApp,
  type ApiResult,
  type Caller,
} from '../testing/integration-app.js';

// SPEC-003 13절 통합(5c): 신청 흐름, 판정 끝점, 위임 호출 결과, 인가, 회차 쪽과의 연결, 개인정보 열.
// 회원 정보는 가짜 회원 조회(`t.members`)가 준다 — member-service를 띄우지 않는다(D13).

let t: TestApp;

beforeAll(async () => {
  t = await TestApp.start();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const apply = (caller: Caller, scheduleId: string) =>
  t.call({
    method: 'POST',
    path: '/api/v1/applications',
    body: { scheduleId },
    user: caller,
  });
const cancelMine = (caller: Caller, applicationId: string) =>
  t.call({
    method: 'PATCH',
    path: `/api/v1/applications/${applicationId}/status`,
    body: { status: 'CANCELLED' },
    user: caller,
  });
const myList = async (caller: Caller, query = '') =>
  (
    await t.call({
      method: 'GET',
      path: `/api/v1/applications${query}`,
      user: caller,
    })
  ).body as MyApplicationListResponse;
const adminPath = (s: Pick<AdminSchedule, 'id' | 'meetupId'>) =>
  `/api/v1/meetups/${s.meetupId}/schedules/${s.id}/applications`;
const adminList = async (s: AdminSchedule, query = '') =>
  (await t.admin('GET', `${adminPath(s)}${query}`))
    .body as AdminApplicationListResponse;
const adminCancel = (s: AdminSchedule, applicationId: string) =>
  t.admin('PATCH', `${adminPath(s)}/${applicationId}/status`, {
    status: 'CANCELLED',
  });
const publicDetail = async (scheduleId: string) =>
  (await t.call({ method: 'GET', path: `/api/v1/events/${scheduleId}` }))
    .body as PublicSchedule;
const adminSchedule = async (s: AdminSchedule) =>
  (await t.admin('GET', `/api/v1/meetups/${s.meetupId}/schedules/${s.id}`))
    .body as AdminSchedule;

/** 한 문장으로 시각을 옮긴다 — CHECK `applyDeadlineAt <= startsAt < endsAt`를 지킨다. */
function moveSchedule(
  scheduleId: string,
  startsAt: Date,
  applyDeadlineAt: Date = startsAt,
) {
  return t.prisma.$executeRaw`
    UPDATE "Schedule"
    SET "startsAt" = ${startsAt}, "applyDeadlineAt" = ${applyDeadlineAt},
        "endsAt" = ${addMinutes(startsAt, 120)}
    WHERE "id" = ${scheduleId}`;
}

/** 요청마다 다른 값(requestId · timestamp · path)을 뺀 에러 본문. */
function stableBody(result: ApiResult) {
  const { requestId, timestamp, path, ...rest } =
    result.body as ApiErrorResponse;
  void requestId;
  void timestamp;
  void path;
  return rest;
}

async function openSchedules(days: number[]) {
  const meetup = await t.createMeetup();
  const schedules: AdminSchedule[] = [];
  for (const day of days) {
    schedules.push(await t.openSchedule(meetup.id, scheduleInput({}, day)));
  }
  return schedules;
}

describe('application flow (integration, SPEC-003 6절 · F · D2)', () => {
  it('apply → list → again → limit → cancel → reapply → operator cancel → no reapply → limit boundary', async () => {
    const [a, b, c] = await openSchedules([7, 14, 21]);
    if (a === undefined || b === undefined || c === undefined)
      throw new Error();
    const man = t.members.add('MALE', 1994);

    const created = await apply(man, a.id);
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    const first = created.body as MyApplication;
    expect(first).toMatchObject({
      scheduleId: a.id,
      status: 'PENDING',
      cancelledBy: null,
      price: 39_000,
      schedule: { title: a.title, venueArea: a.venueArea, status: 'OPEN' },
    });
    expect(created.text).not.toContain('memberId');
    expect(created.text).not.toContain('gender');
    expect(await adminSchedule(a)).toMatchObject({ appliedMale: 1 });

    expect((await myList(man)).items.map((item) => item.id)).toEqual([
      first.id,
    ]);
    expect((await myList(man, `?scheduleId=${b.id}`)).items).toEqual([]);

    const again = await apply(man, a.id);
    expect(again.status).toBe(409);
    expect(codeOf(again)).toBe(API_ERROR_CODES.ALREADY_APPLIED);
    const elsewhere = await apply(man, b.id);
    expect(codeOf(elsewhere)).toBe(API_ERROR_CODES.PENDING_APPLICATION_LIMIT);

    const cancelled = await cancelMine(man, first.id);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'MEMBER',
    });
    const twice = await cancelMine(man, first.id);
    expect(twice.status).toBe(200);
    expect(twice.body).toMatchObject({ cancelledBy: 'MEMBER' });
    expect(await adminSchedule(a)).toMatchObject({ appliedMale: 0 });

    // 본인 취소 뒤에는 새 신청 — CANCELLED 행이 먼저 있어도 판정은 PENDING 행을 가리킨다(9절)
    const reapplied = await apply(man, a.id);
    expect(reapplied.status).toBe(201);
    const second = reapplied.body as MyApplication;
    expect(second.id).not.toBe(first.id);
    expect(
      (await myList(man, `?scheduleId=${a.id}`)).items.map((item) => item.id),
    ).toEqual([second.id, first.id]);
    expect(codeOf(await apply(man, a.id))).toBe(
      API_ERROR_CODES.ALREADY_APPLIED,
    );

    // 운영자 목록은 신청 순 — 두 행
    expect((await adminList(a)).items.map((item) => item.id)).toEqual([
      first.id,
      second.id,
    ]);
    const byAdmin = await adminCancel(a, second.id);
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body as AdminApplication).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'ADMIN',
      memberId: man.id,
      gender: 'MALE',
    });
    expect(codeOf(await apply(man, a.id))).toBe(
      API_ERROR_CODES.REAPPLY_NOT_ALLOWED,
    );

    // 입금 대기 0 → 다른 회차 신청
    const onB = await apply(man, b.id);
    expect(onB.status).toBe(201);

    // 입금 대기 한도는 시작 전 회차만 센다: B 시작 1분 뒤 → C 거절, 1초 전(이미 시작) → C 허용
    const now = Date.now();
    await moveSchedule(b.id, new Date(now + 60_000));
    expect(codeOf(await apply(man, c.id))).toBe(
      API_ERROR_CODES.PENDING_APPLICATION_LIMIT,
    );
    await moveSchedule(b.id, new Date(now - 1_000));
    expect((await apply(man, c.id)).status).toBe(201);
  });

  it('public detail shows the gender full only when the active count reaches capacity', async () => {
    const meetup = await t.createMeetup();
    const s = await t.openSchedule(
      meetup.id,
      scheduleInput({ capacityMale: 1, capacityFemale: 2 }),
    );
    const man = t.members.add('MALE', 1994);
    const woman = t.members.add('FEMALE', 1996);
    expect(await publicDetail(s.id)).toMatchObject({
      maleFull: false,
      femaleFull: false,
    });

    const mine = (await apply(man, s.id)).body as MyApplication;
    await apply(woman, s.id);
    expect(await publicDetail(s.id)).toMatchObject({
      maleFull: true,
      femaleFull: false,
    });
    expect(await adminSchedule(s)).toMatchObject({
      appliedMale: 1,
      appliedFemale: 1,
    });

    await cancelMine(man, mine.id);
    expect(await publicDetail(s.id)).toMatchObject({ maleFull: false });
  });
});

describe('judgments (integration, D7)', () => {
  it('missing · DRAFT · CANCELLED schedules answer the same 404 body', async () => {
    const meetup = await t.createMeetup();
    const draft = await t.createSchedule(meetup.id);
    const cancelled = await t.setStatus(
      await t.openSchedule(meetup.id, scheduleInput({}, 14)),
      'CANCELLED',
      '장소 사정',
    );
    const man = t.members.add('MALE', 1994);

    const results = [
      await apply(man, randomUUID()),
      await apply(man, draft.id),
      await apply(man, cancelled.id),
    ];
    for (const result of results) {
      expect(result.status).toBe(404);
      expect(codeOf(result)).toBe(API_ERROR_CODES.SCHEDULE_NOT_FOUND);
    }
    expect(stableBody(results[1] as ApiResult)).toEqual(
      stableBody(results[0] as ApiResult),
    );
    expect(stableBody(results[2] as ApiResult)).toEqual(
      stableBody(results[0] as ApiResult),
    );
  });

  it('CLOSED and a passed apply deadline → 409 APPLICATION_CLOSED', async () => {
    const [closed, late] = await openSchedules([7, 14]);
    if (closed === undefined || late === undefined) throw new Error();
    await t.setStatus(closed, 'CLOSED');
    await t.prisma.$executeRaw`
      UPDATE "Schedule" SET "applyDeadlineAt" = ${new Date(Date.now() - 1_000)} WHERE "id" = ${late.id}`;
    const man = t.members.add('MALE', 1994);

    for (const s of [closed, late]) {
      const result = await apply(man, s.id);
      expect(result.status).toBe(409);
      expect(codeOf(result)).toBe(API_ERROR_CODES.APPLICATION_CLOSED);
    }
  });

  it('a man outside the male birth years → 409; a woman with the same birth year → 201', async () => {
    const meetup = await t.createMeetup();
    const s = await t.openSchedule(
      meetup.id,
      scheduleInput({ maleMinBirthYear: 1990, maleMaxBirthYear: 1995 }),
    );
    const out = await apply(t.members.add('MALE', 1989), s.id);
    expect(out.status).toBe(409);
    expect(codeOf(out)).toBe(API_ERROR_CODES.BIRTH_YEAR_OUT_OF_RANGE);
    expect((await apply(t.members.add('FEMALE', 1989), s.id)).status).toBe(201);
  });

  it('cancel: after the deadline the member gets 409, the operator 200; before it a CLOSED schedule still lets the member cancel', async () => {
    const [late, closed] = await openSchedules([7, 14]);
    if (late === undefined || closed === undefined) throw new Error();
    const man = t.members.add('MALE', 1994);
    const woman = t.members.add('FEMALE', 1995);

    const lateApp = (await apply(man, late.id)).body as MyApplication;
    await t.prisma.$executeRaw`
      UPDATE "Schedule" SET "applyDeadlineAt" = ${new Date(Date.now() - 1_000)} WHERE "id" = ${late.id}`;
    const tooLate = await cancelMine(man, lateApp.id);
    expect(tooLate.status).toBe(409);
    expect(codeOf(tooLate)).toBe(API_ERROR_CODES.APPLICATION_NOT_CANCELLABLE);
    expect((await adminCancel(late, lateApp.id)).status).toBe(200);

    const closedApp = (await apply(woman, closed.id)).body as MyApplication;
    await t.setStatus(closed, 'CLOSED');
    const ok = await cancelMine(woman, closedApp.id);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ cancelledBy: 'MEMBER' });
  });

  it('cancelling someone else’s application answers the same 404 as a missing one', async () => {
    const [s] = await openSchedules([7]);
    if (s === undefined) throw new Error();
    const owner = t.members.add('MALE', 1994);
    const other = t.members.add('MALE', 1993);
    const app = (await apply(owner, s.id)).body as MyApplication;

    const foreign = await cancelMine(other, app.id);
    const missing = await cancelMine(other, randomUUID());
    expect(foreign.status).toBe(404);
    expect(codeOf(foreign)).toBe(API_ERROR_CODES.APPLICATION_NOT_FOUND);
    expect(stableBody(foreign)).toEqual(stableBody(missing));
    expect(
      await t.prisma.application.count({ where: { status: 'PENDING' } }),
    ).toBe(1);
  });
});

describe('member lookup results (integration, D5)', () => {
  it.each([
    [403, API_ERROR_CODES.ACCOUNT_SUSPENDED],
    [401, API_ERROR_CODES.UNAUTHENTICATED],
    [503, API_ERROR_CODES.SERVICE_BUSY],
  ] as const)('lookup %s → %s and no application row', async (status, code) => {
    const [s] = await openSchedules([7]);
    if (s === undefined) throw new Error();
    const man = t.members.add('MALE', 1994);
    t.members.fail(man, status);

    const result = await apply(man, s.id);
    expect(result.status).toBe(status);
    expect(codeOf(result)).toBe(code);
    if (status === 503) expect(result.headers.get('retry-after')).toBe('1');
    expect(await t.prisma.application.count()).toBe(0);
  });
});

describe('authorization (integration, D6)', () => {
  it('member paths: no caller → 401, ADMIN → 403; operator paths: MEMBER → 403', async () => {
    const [s] = await openSchedules([7]);
    if (s === undefined) throw new Error();
    const id = randomUUID();
    const memberCalls = [
      {
        method: 'POST' as const,
        path: '/api/v1/applications',
        body: { scheduleId: s.id },
      },
      { method: 'GET' as const, path: '/api/v1/applications' },
      {
        method: 'PATCH' as const,
        path: `/api/v1/applications/${id}/status`,
        body: { status: 'CANCELLED' },
      },
    ];
    for (const call of memberCalls) {
      expect((await t.call(call)).status).toBe(401);
      const admin = await t.call({ ...call, user: ADMIN });
      expect(admin.status).toBe(403);
      expect(codeOf(admin)).toBe(API_ERROR_CODES.FORBIDDEN);
    }
    const man = t.members.add('MALE', 1994);
    for (const call of [
      { method: 'GET' as const, path: adminPath(s) },
      {
        method: 'PATCH' as const,
        path: `${adminPath(s)}/${id}/status`,
        body: { status: 'CANCELLED' },
      },
    ]) {
      const member = await t.call({ ...call, user: man });
      expect(member.status).toBe(403);
      expect(codeOf(member)).toBe(API_ERROR_CODES.FORBIDDEN);
    }
  });

  it('operator paths: a schedule of another meetup → 404 SCHEDULE_NOT_FOUND, an application of another schedule → 404 APPLICATION_NOT_FOUND', async () => {
    const [s, other] = await openSchedules([7, 14]);
    if (s === undefined || other === undefined) throw new Error();
    const foreignMeetup = await t.createMeetup('다른 상품');
    const app = (await apply(t.members.add('MALE', 1994), s.id))
      .body as MyApplication;
    const wrongMeetup = { ...s, meetupId: foreignMeetup.id };

    const list = await t.admin('GET', adminPath(wrongMeetup));
    expect(list.status).toBe(404);
    expect(codeOf(list)).toBe(API_ERROR_CODES.SCHEDULE_NOT_FOUND);
    const cancelViaMeetup = await adminCancel(wrongMeetup, app.id);
    expect(cancelViaMeetup.status).toBe(404);
    expect(codeOf(cancelViaMeetup)).toBe(API_ERROR_CODES.SCHEDULE_NOT_FOUND);
    const cancelViaSchedule = await adminCancel(other, app.id);
    expect(cancelViaSchedule.status).toBe(404);
    expect(codeOf(cancelViaSchedule)).toBe(
      API_ERROR_CODES.APPLICATION_NOT_FOUND,
    );
    expect(
      await t.prisma.application.count({ where: { status: 'PENDING' } }),
    ).toBe(1);
  });

  it('marks application responses Cache-Control: no-store', async () => {
    const [s] = await openSchedules([7]);
    if (s === undefined) throw new Error();
    const man = t.members.add('MALE', 1994);
    const created = await apply(man, s.id);
    const listed = await t.call({
      method: 'GET',
      path: '/api/v1/applications',
      user: man,
    });
    const admin = await t.admin('GET', adminPath(s));
    for (const result of [created, listed, admin]) {
      expect(result.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('rejects unknown body fields and non-CANCELLED statuses with 400', async () => {
    const [s] = await openSchedules([7]);
    if (s === undefined) throw new Error();
    const man = t.members.add('MALE', 1994);
    const extra = await t.call({
      method: 'POST',
      path: '/api/v1/applications',
      body: { scheduleId: s.id, gender: 'FEMALE', price: 0 },
      user: man,
    });
    expect(extra.status).toBe(400);
    expect(codeOf(extra)).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    const app = (await apply(man, s.id)).body as MyApplication;
    const pending = await t.call({
      method: 'PATCH',
      path: `/api/v1/applications/${app.id}/status`,
      body: { status: 'PENDING' },
      user: man,
    });
    expect(pending.status).toBe(400);
  });
});

describe('schedule side (integration, D8 · H)', () => {
  it('cancelling a schedule shows its applications as SCHEDULE to the member and the operator', async () => {
    const [s] = await openSchedules([7]);
    if (s === undefined) throw new Error();
    const man = t.members.add('MALE', 1994);
    const woman = t.members.add('FEMALE', 1995);
    await apply(man, s.id);
    await apply(woman, s.id);

    await t.setStatus(s, 'CANCELLED', '장소 사정');

    expect((await myList(man)).items[0]).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'SCHEDULE',
      schedule: { status: 'CANCELLED' },
    });
    const cancelled = await adminList(s, '?status=CANCELLED');
    expect(cancelled.total).toBe(2);
    expect(
      cancelled.items.every((item) => item.cancelledBy === 'SCHEDULE'),
    ).toBe(true);
    expect((await adminList(s, '?status=PENDING')).total).toBe(0);
  });

  it('a price change keeps the snapshot of earlier applications and prices new ones anew', async () => {
    const [s] = await openSchedules([7]);
    if (s === undefined) throw new Error();
    const early = (await apply(t.members.add('MALE', 1994), s.id))
      .body as MyApplication;
    await t.admin('PATCH', `/api/v1/meetups/${s.meetupId}/schedules/${s.id}`, {
      priceMale: 45_000,
    });
    const late = (await apply(t.members.add('MALE', 1993), s.id))
      .body as MyApplication;
    expect(early.price).toBe(39_000);
    expect(late.price).toBe(45_000);
    const listed = await adminList(s);
    expect(listed.items.map((item) => item.price)).toEqual([39_000, 45_000]);
  });
});

describe('personal data (integration, 1절)', () => {
  it('the Application table has no name · phone · email · birth year columns', async () => {
    const columns = await t.prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'Application'`;
    const names = columns.map((row) => row.column_name.toLowerCase());
    expect(names.length).toBeGreaterThan(0);
    for (const forbidden of ['name', 'phone', 'email', 'birthyear']) {
      expect(names).not.toContain(forbidden);
    }
  });
});
