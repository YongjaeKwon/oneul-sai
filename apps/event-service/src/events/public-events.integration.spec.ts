import { randomUUID } from 'node:crypto';
import {
  API_ERROR_CODES,
  type AdminSchedule,
  type ApiErrorResponse,
  type PublicSchedule,
  type PublicScheduleListResponse,
} from '@oneul-sai/contracts';
import {
  ADMIN,
  addMinutes,
  codeOf,
  daysFromToday,
  MEMBER,
  scheduleInput,
  TestApp,
  type Caller,
} from '../testing/integration-app.js';

// SPEC-002 13절 통합: 공개 응답에 비공개 장소 필드가 절대 없다(원문 텍스트 검색) · 공개 목록 조건 · 정렬 · 페이지 · 404 본문 동일.

let t: TestApp;

beforeAll(async () => {
  t = await TestApp.start();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const PRIVATE_KEYS = [
  'venueName',
  'venueAddress',
  'venueDirections',
  'venueMapUrl',
  'cancelReason',
];
const CALLERS: [string, Caller | undefined][] = [
  ['no caller', undefined],
  ['MEMBER', MEMBER],
  ['ADMIN', ADMIN],
];

const listPublic = (query = '', user?: Caller) =>
  t.call({ method: 'GET', path: `/api/v1/events${query}`, user });
const detailPublic = (id: string, user?: Caller) =>
  t.call({ method: 'GET', path: `/api/v1/events/${id}`, user });

describe('public responses never contain private venue fields (integration, D4 · D9)', () => {
  it('has no marker value and no private key name in the raw text, for any caller', async () => {
    const meetup = await t.createMeetup();
    const markers = {
      venueName: `name-${randomUUID()}`,
      venueAddress: `address-${randomUUID()}`,
      venueDirections: `directions-${randomUUID()}`,
      venueMapUrl: `https://map.naver.com/p/${randomUUID()}`,
    };
    const open = await t.openSchedule(meetup.id, scheduleInput(markers));
    // 취소 사유는 CANCELLED에만 있을 수 있다(CHECK). 공개 경로에서 그 회차는 404여야 하고 사유도 새지 않아야 한다.
    const reason = `reason-${randomUUID()}`;
    const cancelled = await t.setStatus(
      await t.openSchedule(meetup.id, scheduleInput({}, 8)),
      'CANCELLED',
      reason,
    );
    const values = [...Object.values(markers), reason];

    for (const [, user] of CALLERS) {
      const list = await listPublic('', user);
      const detail = await detailPublic(open.id, user);
      const gone = await detailPublic(cancelled.id, user);
      expect(list.status).toBe(200);
      expect(detail.status).toBe(200);
      expect(gone.status).toBe(404);
      expect((list.body as PublicScheduleListResponse).items).toHaveLength(1);
      for (const text of [list.text, detail.text, gone.text]) {
        for (const value of values) expect(text).not.toContain(value);
        for (const key of PRIVATE_KEYS) expect(text).not.toContain(key);
        expect(text).not.toContain('meetupId');
      }
    }

    // 같은 회차를 운영자 경로로 부르면 모두 있다
    const adminDetail = await t.admin(
      'GET',
      `/api/v1/meetups/${meetup.id}/schedules/${open.id}`,
    );
    expect(adminDetail.body).toMatchObject(markers);
    const adminCancelled = await t.admin(
      'GET',
      `/api/v1/meetups/${meetup.id}/schedules/${cancelled.id}`,
    );
    expect((adminCancelled.body as AdminSchedule).cancelReason).toBe(reason);
  });
});

describe('public list conditions · order · paging (integration)', () => {
  it('shows only OPEN · CLOSED from now on; a past OPEN detail is still 200', async () => {
    const meetup = await t.createMeetup();
    const draft = await t.createSchedule(meetup.id, scheduleInput({}, 3));
    const open = await t.openSchedule(meetup.id, scheduleInput({}, 4));
    const closed = await t.setStatus(
      await t.openSchedule(meetup.id, scheduleInput({}, 5)),
      'CLOSED',
    );
    await t.setStatus(
      await t.openSchedule(meetup.id, scheduleInput({}, 6)),
      'CANCELLED',
      '사유',
    );
    // 지난 OPEN 회차 — API는 미래 시각만 받으므로 DB를 직접 바꾼다(CHECK는 그대로 적용된다)
    const past = await t.openSchedule(meetup.id, scheduleInput({}, 7));
    const pastStart = daysFromToday(-2);
    await t.prisma.schedule.update({
      where: { id: past.id },
      data: {
        startsAt: pastStart,
        endsAt: addMinutes(pastStart, 120),
        applyDeadlineAt: pastStart,
      },
    });

    const list = await listPublic();
    const items = (list.body as PublicScheduleListResponse).items;
    expect(items.map((item) => item.id)).toEqual([open.id, closed.id]);
    expect(items.map((item) => item.status)).toEqual(['OPEN', 'CLOSED']);
    expect((list.body as PublicScheduleListResponse).total).toBe(2);
    expect(items.map((item) => item.id)).not.toContain(draft.id);

    const pastDetail = await detailPublic(past.id);
    expect(pastDetail.status).toBe(200);
    expect((pastDetail.body as PublicSchedule).status).toBe('OPEN');
  });

  it('orders the same startsAt by id and pages without duplicates or gaps', async () => {
    const meetup = await t.createMeetup();
    const opened: AdminSchedule[] = [];
    // 같은 시작 시각 둘(지역만 다름) + 다른 날 셋
    opened.push(
      await t.openSchedule(meetup.id, scheduleInput({ venueArea: '성수' }, 4)),
    );
    opened.push(
      await t.openSchedule(meetup.id, scheduleInput({ venueArea: '강남' }, 4)),
    );
    for (const days of [5, 6, 7]) {
      opened.push(await t.openSchedule(meetup.id, scheduleInput({}, days)));
    }

    const sameStart = opened
      .slice(0, 2)
      .map((s) => s.id)
      .sort();
    const expected = [...sameStart, ...opened.slice(2).map((s) => s.id)];

    const pages: string[] = [];
    for (const page of [1, 2, 3]) {
      const result = await listPublic(`?page=${page}&pageSize=2`);
      const body = result.body as PublicScheduleListResponse;
      expect(body).toMatchObject({ total: 5, page, pageSize: 2 });
      pages.push(...body.items.map((item) => item.id));
    }
    expect(pages).toEqual(expected);
  });

  it.each([['?pageSize=51'], ['?page=1001'], ['?page=0'], ['?extra=1']])(
    'GET /api/v1/events%s → 400 VALIDATION_FAILED',
    async (query) => {
      const result = await listPublic(query);
      expect(result.status).toBe(400);
      expect(codeOf(result)).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    },
  );

  it('GET /api/v1/events/<not a uuid> → 400', async () => {
    const result = await detailPublic('not-a-uuid');
    expect(result.status).toBe(400);
  });
});

describe('public 404 bodies are identical (integration, D14)', () => {
  it('missing · DRAFT · CANCELLED differ only in requestId · timestamp · path', async () => {
    const meetup = await t.createMeetup();
    const draft = await t.createSchedule(meetup.id, scheduleInput({}, 3));
    const cancelled = await t.setStatus(
      await t.createSchedule(meetup.id, scheduleInput({}, 4)),
      'CANCELLED',
      '사유',
    );

    const bodies = await Promise.all(
      [randomUUID(), draft.id, cancelled.id].map(async (id) => {
        const result = await detailPublic(id);
        expect(result.status).toBe(404);
        const { requestId, timestamp, path, ...rest } =
          result.body as ApiErrorResponse;
        expect([requestId, timestamp, path]).not.toContain(undefined);
        return rest;
      }),
    );
    expect(bodies[0]).toMatchObject({
      code: API_ERROR_CODES.SCHEDULE_NOT_FOUND,
    });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
  });
});
