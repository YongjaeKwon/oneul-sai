import { randomUUID } from 'node:crypto';
import {
  API_ERROR_CODES,
  type AdminApplication,
  type AdminApplicationListResponse,
  type AdminSchedule,
  type ApiErrorResponse,
  type MyApplication,
  type MyApplicationListResponse,
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

// SPEC-003 13절 통합(개정 2026-10-14): 접수 흐름, 참가 가능 안내(D16), 판정 끝점, 위임 호출 결과, 인가, 회차 쪽과의 연결, 개인정보 열.
// 회원 정보는 가짜 회원 조회(`t.members`)가 준다 — member-service를 띄우지 않는다(D13).
// 참가 확정을 만드는 경로는 아직 없다(SPEC-004 5번 PR) — 확정 뒤 규칙은 DB에서 직접 CONFIRMED로 두고 본다.

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
const adminCancel = (
  s: Pick<AdminSchedule, 'id' | 'meetupId'>,
  applicationId: string,
) =>
  t.admin('PATCH', `${adminPath(s)}/${applicationId}/status`, {
    status: 'CANCELLED',
  });
/** 참가 가능 안내(D16) — 같은 PATCH 경로에 PENDING. */
const adminInvite = (
  s: Pick<AdminSchedule, 'id' | 'meetupId'>,
  applicationId: string,
) =>
  t.admin('PATCH', `${adminPath(s)}/${applicationId}/status`, {
    status: 'PENDING',
  });
const publicDetail = (scheduleId: string) =>
  t.call({ method: 'GET', path: `/api/v1/events/${scheduleId}` });
const adminSchedule = async (s: AdminSchedule) =>
  (await t.admin('GET', `/api/v1/meetups/${s.meetupId}/schedules/${s.id}`))
    .body as AdminSchedule;
/** 확정을 만드는 경로가 없어 DB에서 직접 둔다(SPEC-004 5번 PR 전). */
const confirmDirectly = (applicationId: string) =>
  t.prisma.application.update({
    where: { id: applicationId },
    data: { status: 'CONFIRMED' },
  });

const SIX_ZERO = {
  appliedMale: 0,
  appliedFemale: 0,
  receivedMale: 0,
  receivedFemale: 0,
  maleFull: false,
  femaleFull: false,
};

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

/** 신청 마감만 옮긴다(시작보다 앞이면 CHECK를 지킨다). */
const setDeadline = (scheduleId: string, applyDeadlineAt: Date) =>
  t.prisma.$executeRaw`
    UPDATE "Schedule" SET "applyDeadlineAt" = ${applyDeadlineAt} WHERE "id" = ${scheduleId}`;

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

describe('application flow (integration, SPEC-003 6절 · D14 · D15 · D16 · F)', () => {
  it('apply (APPLIED) → list → again → another schedule → invite → limit · boundary → cancel after deadline → reapply → operator cancel → no reapply → cancel PENDING', async () => {
    const [a, b, c] = await openSchedules([7, 14, 21]);
    if (a === undefined || b === undefined || c === undefined)
      throw new Error();
    const man = t.members.add('MALE');

    // 접수 — 자리를 잡지 않는다(D14)
    const created = await apply(man, a.id);
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    const first = created.body as MyApplication;
    expect(first).toMatchObject({
      scheduleId: a.id,
      status: 'APPLIED',
      cancelledBy: null,
      price: 39_000,
      schedule: { title: a.title, venueArea: a.venueArea, status: 'OPEN' },
    });
    expect(created.text).not.toContain('memberId');
    expect(created.text).not.toContain('gender');
    expect(await adminSchedule(a)).toMatchObject({
      ...SIX_ZERO,
      receivedMale: 1,
    });

    expect((await myList(man)).items.map((item) => item.id)).toEqual([
      first.id,
    ]);
    expect((await myList(man, `?scheduleId=${b.id}`)).items).toEqual([]);

    const again = await apply(man, a.id);
    expect(again.status).toBe(409);
    expect(codeOf(again)).toBe(API_ERROR_CODES.ALREADY_APPLIED);

    // 접수는 입금 대기 한도 밖 — 다른 회차에도 접수된다(S5)
    const onB = await apply(man, b.id);
    expect(onB.status).toBe(201);
    const second = onB.body as MyApplication;

    // 참가 가능 안내 — 이때 자리를 잡는다(D16)
    const invited = await adminInvite(a, first.id);
    expect(invited.status).toBe(200);
    expect(invited.body as AdminApplication).toMatchObject({
      id: first.id,
      status: 'PENDING',
      cancelledBy: null,
      memberId: man.id,
      gender: 'MALE',
    });
    expect(await adminSchedule(a)).toMatchObject({
      ...SIX_ZERO,
      appliedMale: 1,
    });
    expect((await myList(man, `?scheduleId=${a.id}`)).items[0]).toMatchObject({
      status: 'PENDING',
      cancelledBy: null,
    });

    // 입금 대기가 있으면 새 접수는 막힌다(F) — 시작 전 회차만 센다: A 시작 1초 전(이미 시작)이면 C 허용
    expect(codeOf(await apply(man, c.id))).toBe(
      API_ERROR_CODES.PENDING_APPLICATION_LIMIT,
    );
    await moveSchedule(a.id, new Date(Date.now() - 1_000));
    expect((await apply(man, c.id)).status).toBe(201);

    // 접수의 본인 취소는 신청 마감 뒤에도 된다(S3)
    await setDeadline(b.id, new Date(Date.now() - 1_000));
    const cancelled = await cancelMine(man, second.id);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'MEMBER',
    });
    const twice = await cancelMine(man, second.id);
    expect(twice.status).toBe(200);
    expect(twice.body).toMatchObject({ cancelledBy: 'MEMBER' });
    expect(codeOf(await apply(man, b.id))).toBe(
      API_ERROR_CODES.APPLICATION_CLOSED,
    );

    // 본인 취소 뒤에는 새 접수 — CANCELLED 행이 먼저 있어도 판정은 활성 행을 가리킨다(9절)
    await setDeadline(b.id, new Date(b.applyDeadlineAt));
    const reapplied = await apply(man, b.id);
    expect(reapplied.status).toBe(201);
    const third = reapplied.body as MyApplication;
    expect(third.id).not.toBe(second.id);
    expect(
      (await myList(man, `?scheduleId=${b.id}`)).items.map((item) => item.id),
    ).toEqual([third.id, second.id]);
    expect(codeOf(await apply(man, b.id))).toBe(
      API_ERROR_CODES.ALREADY_APPLIED,
    );
    // 운영자 목록은 신청 순, 필터 APPLIED에는 활성 접수만
    expect((await adminList(b)).items.map((item) => item.id)).toEqual([
      second.id,
      third.id,
    ]);
    expect(
      (await adminList(b, '?status=APPLIED')).items.map((item) => item.id),
    ).toEqual([third.id]);

    // 접수 단계의 운영자 취소(탈락 처리) 뒤에는 같은 회차에 다시 신청할 수 없다(F · S4)
    const byAdmin = await adminCancel(b, third.id);
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body as AdminApplication).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'ADMIN',
      memberId: man.id,
      gender: 'MALE',
    });
    expect(codeOf(await apply(man, b.id))).toBe(
      API_ERROR_CODES.REAPPLY_NOT_ALLOWED,
    );
    expect(await adminSchedule(b)).toMatchObject(SIX_ZERO);

    // 입금 대기의 본인 취소는 신청 마감 전까지(C) — 자리가 돌아간다
    await moveSchedule(a.id, new Date(a.startsAt));
    const freed = await cancelMine(man, first.id);
    expect(freed.status).toBe(200);
    expect(freed.body).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'MEMBER',
    });
    expect(await adminSchedule(a)).toMatchObject(SIX_ZERO);
    expect(await adminSchedule(c)).toMatchObject({
      ...SIX_ZERO,
      receivedMale: 1,
    });
  });

  it('capacity never gates an application; invites take seats per gender and a freed seat can be given again (★S2 · D16)', async () => {
    const meetup = await t.createMeetup();
    const s = await t.openSchedule(
      meetup.id,
      scheduleInput({ capacityMale: 1, capacityFemale: 1 }),
    );
    const firstMan = t.members.add('MALE');
    const secondMan = t.members.add('MALE');
    const woman = t.members.add('FEMALE');

    const his = (await apply(firstMan, s.id)).body as MyApplication;
    const late = await apply(secondMan, s.id);
    expect(late.status).toBe(201); // 정원 1이어도 접수된다
    const hisLate = late.body as MyApplication;
    const hers = (await apply(woman, s.id)).body as MyApplication;
    expect(await adminSchedule(s)).toMatchObject({
      ...SIX_ZERO,
      receivedMale: 2,
      receivedFemale: 1,
    });
    // 공개 응답에는 신청 관련 값이 없다(★S2)
    const open = await publicDetail(s.id);
    expect(open.status).toBe(200);
    for (const key of ['maleFull', 'femaleFull', 'applied', 'received']) {
      expect(open.text).not.toContain(key);
    }

    expect((await adminInvite(s, his.id)).status).toBe(200);
    const full = await adminInvite(s, hisLate.id);
    expect(full.status).toBe(409);
    expect(codeOf(full)).toBe(API_ERROR_CODES.SCHEDULE_FULL);
    // 남성 자리가 차도 여성 안내는 된다
    expect((await adminInvite(s, hers.id)).status).toBe(200);
    expect(await adminSchedule(s)).toMatchObject({
      appliedMale: 1,
      receivedMale: 1,
      maleFull: true,
      appliedFemale: 1,
      receivedFemale: 0,
      femaleFull: true,
    });
    expect(
      await t.prisma.application.findUniqueOrThrow({
        where: { id: hisLate.id },
      }),
    ).toMatchObject({ status: 'APPLIED' });

    // 자리가 돌아가면 다음 접수에 안내할 수 있다
    expect((await adminCancel(s, his.id)).status).toBe(200);
    expect((await adminInvite(s, hisLate.id)).status).toBe(200);
    expect(await adminSchedule(s)).toMatchObject({
      appliedMale: 1,
      receivedMale: 0,
      maleFull: true,
    });
  });
});

describe('invite — 참가 가능 안내 (integration, D16)', () => {
  it('on a CLOSED schedule → 200; twice → 200 unchanged; after a member cancel → 409 INVALID_STATUS_TRANSITION', async () => {
    const [s] = await openSchedules([7]);
    if (s === undefined) throw new Error();
    const man = t.members.add('MALE');
    const woman = t.members.add('FEMALE');
    const his = (await apply(man, s.id)).body as MyApplication;
    const hers = (await apply(woman, s.id)).body as MyApplication;

    // 모집 마감은 접수를 막지 안내를 막지 않는다
    await t.setStatus(s, 'CLOSED');
    expect((await adminInvite(s, his.id)).status).toBe(200);
    const again = await adminInvite(s, his.id);
    expect(again.status).toBe(200);
    expect(again.body as AdminApplication).toMatchObject({
      status: 'PENDING',
      cancelledBy: null,
    });
    expect(await adminSchedule(s)).toMatchObject({
      appliedMale: 1,
      receivedMale: 0,
    });

    expect((await cancelMine(woman, hers.id)).status).toBe(200);
    const gone = await adminInvite(s, hers.id);
    expect(gone.status).toBe(409);
    expect(codeOf(gone)).toBe(API_ERROR_CODES.INVALID_STATUS_TRANSITION);
    expect(
      await t.prisma.application.findUniqueOrThrow({ where: { id: hers.id } }),
    ).toMatchObject({ status: 'CANCELLED', cancelledBy: 'MEMBER' });
  });

  it('CONFIRMED (set directly — SPEC-004): member cancel → 409 APPLICATION_CONFIRMED before the deadline, invite → 409, it is a seat and an active application, operator cancel → 200', async () => {
    const [s, other] = await openSchedules([7, 14]);
    if (s === undefined || other === undefined) throw new Error();
    const man = t.members.add('MALE');
    const app = (await apply(man, s.id)).body as MyApplication;
    expect((await adminInvite(s, app.id)).status).toBe(200);
    await confirmDirectly(app.id);

    expect(await adminSchedule(s)).toMatchObject({
      appliedMale: 1,
      receivedMale: 0,
    });
    expect(
      (await adminList(s, '?status=CONFIRMED')).items.map((item) => item.id),
    ).toEqual([app.id]);
    expect((await myList(man)).items[0]).toMatchObject({
      status: 'CONFIRMED',
      cancelledBy: null,
    });

    const mine = await cancelMine(man, app.id);
    expect(mine.status).toBe(409);
    expect(codeOf(mine)).toBe(API_ERROR_CODES.APPLICATION_CONFIRMED);
    const invite = await adminInvite(s, app.id);
    expect(invite.status).toBe(409);
    expect(codeOf(invite)).toBe(API_ERROR_CODES.INVALID_STATUS_TRANSITION);
    // 확정은 활성이라 같은 회차는 409, 입금 대기 한도 밖이라 다른 회차는 접수된다
    expect(codeOf(await apply(man, s.id))).toBe(
      API_ERROR_CODES.ALREADY_APPLIED,
    );
    expect((await apply(man, other.id)).status).toBe(201);

    const byAdmin = await adminCancel(s, app.id);
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'ADMIN',
    });
    expect(await adminSchedule(s)).toMatchObject(SIX_ZERO);
  });
});

describe('judgments (integration, D15 · D16)', () => {
  it('missing · DRAFT · CANCELLED schedules answer the same 404 body', async () => {
    const meetup = await t.createMeetup();
    const draft = await t.createSchedule(meetup.id);
    const cancelled = await t.setStatus(
      await t.openSchedule(meetup.id, scheduleInput({}, 14)),
      'CANCELLED',
      '장소 사정',
    );
    const man = t.members.add('MALE');

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
    await setDeadline(late.id, new Date(Date.now() - 1_000));
    const man = t.members.add('MALE');

    for (const s of [closed, late]) {
      const result = await apply(man, s.id);
      expect(result.status).toBe(409);
      expect(codeOf(result)).toBe(API_ERROR_CODES.APPLICATION_CLOSED);
    }
  });

  it('a male birth-year range does not gate applications — a man and a woman both get 201 (★S1)', async () => {
    const meetup = await t.createMeetup();
    const s = await t.openSchedule(
      meetup.id,
      scheduleInput({ maleMinBirthYear: 1990, maleMaxBirthYear: 1995 }),
    );
    expect((await apply(t.members.add('MALE'), s.id)).status).toBe(201);
    expect((await apply(t.members.add('FEMALE'), s.id)).status).toBe(201);
    expect(await adminSchedule(s)).toMatchObject({
      receivedMale: 1,
      receivedFemale: 1,
    });
  });

  it('cancel after the deadline: PENDING member → 409, APPLIED member → 200 (S3), operator → 200; before it a CLOSED schedule still lets a PENDING member cancel', async () => {
    const [late, closed] = await openSchedules([7, 14]);
    if (late === undefined || closed === undefined) throw new Error();
    const invitedMan = t.members.add('MALE');
    const receivedMan = t.members.add('MALE');
    const woman = t.members.add('FEMALE');

    const pending = (await apply(invitedMan, late.id)).body as MyApplication;
    expect((await adminInvite(late, pending.id)).status).toBe(200);
    const received = (await apply(receivedMan, late.id)).body as MyApplication;
    await setDeadline(late.id, new Date(Date.now() - 1_000));

    const tooLate = await cancelMine(invitedMan, pending.id);
    expect(tooLate.status).toBe(409);
    expect(codeOf(tooLate)).toBe(API_ERROR_CODES.APPLICATION_NOT_CANCELLABLE);
    const anyTime = await cancelMine(receivedMan, received.id);
    expect(anyTime.status).toBe(200);
    expect(anyTime.body).toMatchObject({ cancelledBy: 'MEMBER' });
    expect((await adminCancel(late, pending.id)).status).toBe(200);

    const hers = (await apply(woman, closed.id)).body as MyApplication;
    expect((await adminInvite(closed, hers.id)).status).toBe(200);
    await t.setStatus(closed, 'CLOSED');
    const ok = await cancelMine(woman, hers.id);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ cancelledBy: 'MEMBER' });
  });

  it('cancelling someone else’s application answers the same 404 as a missing one', async () => {
    const [s] = await openSchedules([7]);
    if (s === undefined) throw new Error();
    const owner = t.members.add('MALE');
    const other = t.members.add('MALE');
    const app = (await apply(owner, s.id)).body as MyApplication;

    const foreign = await cancelMine(other, app.id);
    const missing = await cancelMine(other, randomUUID());
    expect(foreign.status).toBe(404);
    expect(codeOf(foreign)).toBe(API_ERROR_CODES.APPLICATION_NOT_FOUND);
    expect(stableBody(foreign)).toEqual(stableBody(missing));
    expect(
      await t.prisma.application.count({ where: { status: 'APPLIED' } }),
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
    const man = t.members.add('MALE');
    t.members.fail(man, status);

    const result = await apply(man, s.id);
    expect(result.status).toBe(status);
    expect(codeOf(result)).toBe(code);
    if (status === 503) expect(result.headers.get('retry-after')).toBe('1');
    expect(await t.prisma.application.count()).toBe(0);
  });
});

describe('authorization (integration, D6 · D16)', () => {
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
    const man = t.members.add('MALE');
    for (const call of [
      { method: 'GET' as const, path: adminPath(s) },
      {
        method: 'PATCH' as const,
        path: `${adminPath(s)}/${id}/status`,
        body: { status: 'PENDING' },
      },
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

  it('operator paths: a schedule of another meetup → 404 SCHEDULE_NOT_FOUND, an application of another schedule → 404 APPLICATION_NOT_FOUND (list · invite · cancel)', async () => {
    const [s, other] = await openSchedules([7, 14]);
    if (s === undefined || other === undefined) throw new Error();
    const foreignMeetup = await t.createMeetup('다른 상품');
    const app = (await apply(t.members.add('MALE'), s.id))
      .body as MyApplication;
    const wrongMeetup = { ...s, meetupId: foreignMeetup.id };

    const list = await t.admin('GET', adminPath(wrongMeetup));
    expect(list.status).toBe(404);
    expect(codeOf(list)).toBe(API_ERROR_CODES.SCHEDULE_NOT_FOUND);
    for (const act of [adminInvite, adminCancel]) {
      const viaMeetup = await act(wrongMeetup, app.id);
      expect(viaMeetup.status).toBe(404);
      expect(codeOf(viaMeetup)).toBe(API_ERROR_CODES.SCHEDULE_NOT_FOUND);
      const viaSchedule = await act(other, app.id);
      expect(viaSchedule.status).toBe(404);
      expect(codeOf(viaSchedule)).toBe(API_ERROR_CODES.APPLICATION_NOT_FOUND);
    }
    expect(
      await t.prisma.application.count({ where: { status: 'APPLIED' } }),
    ).toBe(1);
  });

  it('marks application responses Cache-Control: no-store', async () => {
    const [s] = await openSchedules([7]);
    if (s === undefined) throw new Error();
    const man = t.members.add('MALE');
    const created = await apply(man, s.id);
    const listed = await t.call({
      method: 'GET',
      path: '/api/v1/applications',
      user: man,
    });
    const admin = await t.admin('GET', adminPath(s));
    const invited = await adminInvite(s, (created.body as MyApplication).id);
    for (const result of [created, listed, admin, invited]) {
      expect(result.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('rejects unknown body fields, PENDING on the member path and APPLIED · CONFIRMED on the operator path with 400', async () => {
    const [s] = await openSchedules([7]);
    if (s === undefined) throw new Error();
    const man = t.members.add('MALE');
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
    expect(codeOf(pending)).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    for (const status of ['APPLIED', 'CONFIRMED']) {
      const result = await t.admin(
        'PATCH',
        `${adminPath(s)}/${app.id}/status`,
        { status },
      );
      expect(result.status).toBe(400);
      expect(codeOf(result)).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    }
    expect(
      await t.prisma.application.findUniqueOrThrow({ where: { id: app.id } }),
    ).toMatchObject({ status: 'APPLIED' });
  });
});

describe('schedule side (integration, D8 · H)', () => {
  it('cancelling a schedule cancels received and invited applications alike as SCHEDULE', async () => {
    const [s] = await openSchedules([7]);
    if (s === undefined) throw new Error();
    const man = t.members.add('MALE');
    const woman = t.members.add('FEMALE');
    await apply(man, s.id);
    const hers = (await apply(woman, s.id)).body as MyApplication;
    expect((await adminInvite(s, hers.id)).status).toBe(200);

    const cancelledSchedule = await t.setStatus(s, 'CANCELLED', '장소 사정');
    expect(cancelledSchedule).toMatchObject(SIX_ZERO);

    for (const caller of [man, woman]) {
      expect((await myList(caller)).items[0]).toMatchObject({
        status: 'CANCELLED',
        cancelledBy: 'SCHEDULE',
        schedule: { status: 'CANCELLED' },
      });
    }
    const cancelled = await adminList(s, '?status=CANCELLED');
    expect(cancelled.total).toBe(2);
    expect(
      cancelled.items.every((item) => item.cancelledBy === 'SCHEDULE'),
    ).toBe(true);
    expect((await adminList(s, '?status=APPLIED')).total).toBe(0);
    expect((await adminList(s, '?status=PENDING')).total).toBe(0);
  });

  it('a price change keeps the snapshot of earlier applications and prices new ones anew', async () => {
    const [s] = await openSchedules([7]);
    if (s === undefined) throw new Error();
    const early = (await apply(t.members.add('MALE'), s.id))
      .body as MyApplication;
    await t.admin('PATCH', `/api/v1/meetups/${s.meetupId}/schedules/${s.id}`, {
      priceMale: 45_000,
    });
    const late = (await apply(t.members.add('MALE'), s.id))
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
