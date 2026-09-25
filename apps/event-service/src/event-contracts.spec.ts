import {
  AdminApplicationListQuerySchema,
  AdminScheduleListQuerySchema,
  AdminScheduleSchema,
  BatchCreateSchedulesRequestSchema,
  CreateApplicationRequestSchema,
  CreateMeetupRequestSchema,
  CreateScheduleRequestSchema,
  MeetupListQuerySchema,
  MemberListQuerySchema,
  MyApplicationListQuerySchema,
  MyApplicationSchema,
  PublicScheduleListQuerySchema,
  PublicScheduleSchema,
  UpdateApplicationStatusRequestSchema,
  UpdateScheduleRequestSchema,
  UpdateScheduleStatusRequestSchema,
  VENUE_MAP_URL_MAX_LENGTH,
  type CreateScheduleRequest,
} from '@oneul-sai/contracts';
import { formatIssues } from '@oneul-sai/service-kit';

// SPEC-002 13절 단위: contracts에는 vitest가 없으므로 event-service가 contracts 스키마의 경계값을 검사한다.
// 실패 message는 service-kit formatIssues 형식(입력값 없음)이다.

const item: CreateScheduleRequest = {
  startsAt: '2026-10-04T14:00:00+09:00',
  endsAt: '2026-10-04T16:30:00+09:00',
  applyDeadlineAt: '2026-10-03T14:00:00+09:00',
  priceMale: 39_000,
  priceFemale: 29_000,
  capacityMale: 7,
  capacityFemale: 7,
  venueArea: '성수',
};

const create = (overrides: Record<string, unknown>) =>
  CreateScheduleRequestSchema.safeParse({ ...item, ...overrides });

function without(key: keyof CreateScheduleRequest) {
  const copy: Record<string, unknown> = { ...item };
  delete copy[key];
  return copy;
}

/** 실패해야 하고, message에 입력값이 없어야 한다. */
function expectRejected(
  result:
    | { success: true }
    | { success: false; error: { issues: Parameters<typeof formatIssues>[0] } },
  input?: string,
): string {
  expect(result.success).toBe(false);
  const message = result.success ? '' : formatIssues(result.error.issues);
  if (input !== undefined) expect(message).not.toContain(input);
  return message;
}

describe('CreateScheduleRequest — price · capacity (D2 · D3)', () => {
  it.each([['priceMale'], ['priceFemale']])(
    '%s rejects -1 · 1,000,001 · 1.5',
    (field) => {
      for (const value of [-1, 1_000_001, 1.5]) {
        expectRejected(create({ [field]: value }));
      }
    },
  );

  it.each([['priceMale'], ['priceFemale']])(
    '%s accepts 0 · 1,000,000',
    (field) => {
      expect(create({ [field]: 0 }).success).toBe(true);
      expect(create({ [field]: 1_000_000 }).success).toBe(true);
    },
  );

  it('accepts different prices for men and women (0 · 1,000,000)', () => {
    expect(create({ priceMale: 0, priceFemale: 1_000_000 }).success).toBe(true);
  });

  it('rejects capacity 0 · 51, accepts 1 · 50 and 7 · 6 (no relation check)', () => {
    expectRejected(create({ capacityMale: 0 }));
    expectRejected(create({ capacityFemale: 51 }));
    expect(create({ capacityMale: 1, capacityFemale: 50 }).success).toBe(true);
    expect(create({ capacityMale: 7, capacityFemale: 6 }).success).toBe(true);
  });
});

describe('CreateScheduleRequest — required · strict', () => {
  it.each<[keyof CreateScheduleRequest]>([
    ['priceMale'],
    ['priceFemale'],
    ['capacityMale'],
    ['endsAt'],
    ['applyDeadlineAt'],
  ])('rejects a missing %s', (key) => {
    expectRejected(CreateScheduleRequestSchema.safeParse(without(key)));
  });

  it.each([
    ['price', 39_000],
    ['minBirthYear', 1990],
    ['maxBirthYear', 1995],
    ['femaleMinBirthYear', 1990],
    ['status', 'OPEN'],
    ['meetupId', '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01'],
    ['defaultPrice', 39_000],
  ])('rejects the unknown field %s', (key, value) => {
    const message = expectRejected(create({ [key]: value }));
    expect(message).toContain('모르는 필드');
  });
});

describe('CreateScheduleRequest — male birth years (D5)', () => {
  it.each([[1899], [10_000], [1990.5]])('rejects %s', (year) => {
    expectRejected(create({ maleMinBirthYear: year }));
    expectRejected(create({ maleMaxBirthYear: year }));
  });

  it('accepts 1900 · 9999 and absent', () => {
    expect(
      create({ maleMinBirthYear: 1900, maleMaxBirthYear: 9999 }).success,
    ).toBe(true);
    expect(create({}).success).toBe(true);
  });
});

describe('text fields · times', () => {
  it('rejects a 101-character title and a whitespace-only title', () => {
    expect(
      CreateMeetupRequestSchema.safeParse({ title: '가'.repeat(101) }).success,
    ).toBe(false);
    expect(CreateMeetupRequestSchema.safeParse({ title: '   ' }).success).toBe(
      false,
    );
  });

  it('rejects NUL in description, accepts newline and tab', () => {
    expect(
      CreateMeetupRequestSchema.safeParse({
        title: 't',
        description: 'a\u0000b',
      }).success,
    ).toBe(false);
    expect(
      CreateMeetupRequestSchema.safeParse({
        title: 't',
        description: '첫 줄\n둘째 줄\t탭',
      }).success,
    ).toBe(true);
  });

  it.each([['‮'], ['⁦']])(
    'rejects bidi control %j in title and venueArea',
    (char) => {
      expect(
        CreateMeetupRequestSchema.safeParse({ title: `제목${char}` }).success,
      ).toBe(false);
      expectRejected(create({ venueArea: `성수${char}` }));
    },
  );

  it('rejects a time without offset, accepts +09:00 and Z', () => {
    expectRejected(create({ startsAt: '2026-10-04T14:00:00' }), '2026-10-04');
    expect(create({ startsAt: '2026-10-04T14:00:00+09:00' }).success).toBe(
      true,
    );
    expect(create({ startsAt: '2026-10-04T05:00:00Z' }).success).toBe(true);
  });

  it('does not echo input values in the message', () => {
    expectRejected(create({ venueArea: 'MARKER-\u0000' }), 'MARKER');
  });
});

describe('UpdateScheduleRequest · UpdateScheduleStatusRequest', () => {
  it('rejects an empty object and venueArea: null, accepts venueName: null', () => {
    expect(UpdateScheduleRequestSchema.safeParse({}).success).toBe(false);
    expect(
      UpdateScheduleRequestSchema.safeParse({ venueArea: null }).success,
    ).toBe(false);
    expect(
      UpdateScheduleRequestSchema.safeParse({ venueName: null }).success,
    ).toBe(true);
  });

  it.each<[string, Record<string, unknown>]>([
    ['DRAFT', { status: 'DRAFT' }],
    ['CANCELLED without reason', { status: 'CANCELLED' }],
    ['OPEN with reason', { status: 'OPEN', cancelReason: '사유' }],
  ])('rejects %s', (_label, body) => {
    expect(UpdateScheduleStatusRequestSchema.safeParse(body).success).toBe(
      false,
    );
  });
});

describe('list queries', () => {
  it('rejects from ≥ to', () => {
    const same = '2026-10-04T00:00:00Z';
    expect(
      AdminScheduleListQuerySchema.safeParse({ from: same, to: same }).success,
    ).toBe(false);
  });

  it('rejects public pageSize=51', () => {
    expect(
      PublicScheduleListQuerySchema.safeParse({ pageSize: '51' }).success,
    ).toBe(false);
  });

  it.each([
    ['MeetupListQuery', MeetupListQuerySchema],
    ['AdminScheduleListQuery', AdminScheduleListQuerySchema],
    ['PublicScheduleListQuery', PublicScheduleListQuerySchema],
  ] as const)('%s: page=1001 fails, page=1000 passes', (_label, schema) => {
    expect(schema.safeParse({ page: '1001' }).success).toBe(false);
    expect(schema.safeParse({ page: '1000' }).success).toBe(true);
  });
});

describe('BatchCreateSchedulesRequest (D15)', () => {
  const weekly = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      ...item,
      startsAt: `2026-10-${String(4 + index).padStart(2, '0')}T14:00:00+09:00`,
      endsAt: `2026-10-${String(4 + index).padStart(2, '0')}T16:00:00+09:00`,
      applyDeadlineAt: `2026-10-${String(4 + index).padStart(2, '0')}T14:00:00+09:00`,
    }));
  const batch = (items: unknown) =>
    BatchCreateSchedulesRequestSchema.safeParse({ items });
  const messageOf = (result: ReturnType<typeof batch>) =>
    result.success ? '' : formatIssues(result.error.issues);

  it('rejects 0 and 13 items, accepts 1 and 12', () => {
    expect(batch([]).success).toBe(false);
    expect(batch(weekly(13)).success).toBe(false);
    expect(batch(weekly(1)).success).toBe(true);
    expect(batch(weekly(12)).success).toBe(true);
  });

  it('rejects a missing or non-array items', () => {
    expect(BatchCreateSchedulesRequestSchema.safeParse({}).success).toBe(false);
    expect(batch('items').success).toBe(false);
  });

  it('points at the third item: items.2.priceMale', () => {
    const items = weekly(4);
    items[2] = { ...items[2]!, priceMale: -1 };
    const result = batch(items);
    expect(result.success).toBe(false);
    expect(messageOf(result)).toMatch(/^items\.2\.priceMale: /);
  });

  it.each([
    ['meetupId', '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01'],
    ['status', 'DRAFT'],
  ])('rejects %s inside an item (strict)', (key, value) => {
    expect(batch([{ ...item, [key]: value }]).success).toBe(false);
  });

  it.each<[string, Partial<CreateScheduleRequest>, boolean]>([
    ['same startsAt and venueArea', {}, false],
    ['same instant written as Z', { startsAt: '2026-10-04T05:00:00Z' }, false],
    [
      'venueArea differing only in surrounding spaces',
      { venueArea: ' 성수 ' },
      false,
    ],
    ['same time, different area', { venueArea: '강남' }, true],
    [
      'different time, same area',
      {
        startsAt: '2026-10-04T15:00:00+09:00',
        endsAt: '2026-10-04T17:00:00+09:00',
      },
      true,
    ],
  ])('duplicates: %s', (_label, second, ok) => {
    const result = batch([item, { ...item, ...second }]);
    expect(result.success).toBe(ok);
    if (!ok) {
      expect(messageOf(result)).toBe('items.1.startsAt: 규칙');
      expect(messageOf(result)).not.toContain('성수');
    }
  });
});

describe('venueMapUrl (D4)', () => {
  const link = (venueMapUrl: string) => create({ venueMapUrl });

  it.each([
    ['https://map.kakao.com/?q=a'],
    ['https://place.map.kakao.com/123'],
    ['https://kko.to/abc'],
    ['https://map.naver.com/p/entry/place/1'],
    ['https://naver.me/xyz'],
  ])('accepts %s', (url) => {
    expect(link(url).success).toBe(true);
  });

  it('accepts an upper-case host and stores the lower-case href', () => {
    const result = link('https://MAP.KAKAO.COM/?q=a');
    expect(result.success && result.data.venueMapUrl).toBe(
      'https://map.kakao.com/?q=a',
    );
  });

  it.each([
    ['http://map.kakao.com/?q=a'],
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['https://map.kakao.com.evil.example/'],
    ['https://evil.example/map.kakao.com'],
    ['https://user@map.naver.com/'],
    ['https://map.naver.com@evil.example/'],
    ['https://map.naver.com:8443/'],
  ])('rejects %s', (url) => {
    expectRejected(link(url), url);
  });

  it('rejects a link whose normalized href exceeds the limit (Korean query)', () => {
    const url = `https://map.naver.com/?q=${'가'.repeat(120)}`;
    expect(url.length).toBeLessThan(VENUE_MAP_URL_MAX_LENGTH);
    expect(new URL(url).href.length).toBeGreaterThan(VENUE_MAP_URL_MAX_LENGTH);
    expectRejected(link(url));
  });

  it('AdminScheduleSchema passes a stored link outside the allow list (no request rule reuse)', () => {
    const row = {
      id: '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01',
      meetupId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
      title: 't',
      description: '',
      startsAt: '2026-10-04T05:00:00.000Z',
      endsAt: '2026-10-04T07:00:00.000Z',
      applyDeadlineAt: '2026-10-04T05:00:00.000Z',
      priceMale: 0,
      priceFemale: 0,
      capacityMale: 7,
      capacityFemale: 7,
      maleMinBirthYear: null,
      maleMaxBirthYear: null,
      venueArea: '성수',
      venueName: null,
      venueAddress: null,
      venueDirections: null,
      venueMapUrl: 'https://old.example/',
      status: 'DRAFT',
      cancelReason: null,
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:00:00.000Z',
      maleFull: false,
      femaleFull: false,
      appliedMale: 0,
      appliedFemale: 0,
    };
    expect(AdminScheduleSchema.parse(row).venueMapUrl).toBe(
      'https://old.example/',
    );
  });
});

// SPEC-003 13절 단위: 참가 신청 · 회원 ID 목록 조회의 계약 경계값.
describe('application requests (SPEC-003)', () => {
  const scheduleId = '3b241101-e2bb-4255-8caf-4136c566a962';

  it('CreateApplicationRequest takes only scheduleId (UUID)', () => {
    expect(
      CreateApplicationRequestSchema.safeParse({ scheduleId }).success,
    ).toBe(true);
    for (const body of [
      {},
      { scheduleId: 'not-a-uuid' },
      { scheduleId, gender: 'MALE' },
      { scheduleId, price: 0 },
      { scheduleId, memberId: scheduleId },
    ]) {
      expectRejected(
        CreateApplicationRequestSchema.safeParse(body),
        'not-a-uuid',
      );
    }
  });

  it('UpdateApplicationStatusRequest accepts only CANCELLED', () => {
    expect(
      UpdateApplicationStatusRequestSchema.safeParse({ status: 'CANCELLED' })
        .success,
    ).toBe(true);
    for (const body of [
      {},
      { status: 'PENDING' },
      { status: 'CANCELLED', reason: 'x' },
    ]) {
      expect(UpdateApplicationStatusRequestSchema.safeParse(body).success).toBe(
        false,
      );
    }
  });

  it('MyApplicationListQuery: pageSize 50 passes, 51 · page 1001 fail, default 20', () => {
    expect(MyApplicationListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(
      MyApplicationListQuerySchema.safeParse({ pageSize: '50' }).success,
    ).toBe(true);
    expect(
      MyApplicationListQuerySchema.safeParse({ pageSize: '51' }).success,
    ).toBe(false);
    expect(
      MyApplicationListQuerySchema.safeParse({ page: '1001' }).success,
    ).toBe(false);
  });

  it('AdminApplicationListQuery: default 100, 101 fails, unknown status fails', () => {
    expect(AdminApplicationListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 100,
    });
    expect(
      AdminApplicationListQuerySchema.safeParse({ pageSize: '101' }).success,
    ).toBe(false);
    expect(
      AdminApplicationListQuerySchema.safeParse({ status: 'CONFIRMED' })
        .success,
    ).toBe(false);
  });
});

describe('MemberListQuery.ids (SPEC-003 D11)', () => {
  const uuid = (n: number) =>
    `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
  const ids = (count: number) =>
    Array.from({ length: count }, (_, index) => uuid(index)).join(',');

  it('accepts 1 and 100 ids (pageSize large enough) and splits them', () => {
    expect(MemberListQuerySchema.parse({ ids: uuid(1) }).ids).toEqual([
      uuid(1),
    ]);
    expect(
      MemberListQuerySchema.parse({ ids: ids(100), pageSize: '100' }).ids,
    ).toHaveLength(100);
  });

  it('rejects 101 ids, a non-UUID, an empty string and an empty item', () => {
    for (const value of [
      ids(101),
      `${uuid(1)},x`,
      '',
      `${uuid(1)},,${uuid(2)}`,
    ]) {
      expectRejected(
        MemberListQuerySchema.safeParse({ ids: value, pageSize: '100' }),
        value === '' ? undefined : value,
      );
    }
  });

  it('rejects more ids than pageSize', () => {
    expect(MemberListQuerySchema.safeParse({ ids: ids(21) }).success).toBe(
      false,
    );
    expect(
      MemberListQuerySchema.safeParse({ ids: ids(21), pageSize: '21' }).success,
    ).toBe(true);
  });
});

describe('schedule responses with applications (SPEC-003 D10)', () => {
  it('PublicScheduleSchema requires maleFull · femaleFull and has no counts', () => {
    const keys = Object.keys(PublicScheduleSchema.shape);
    expect(keys).toEqual(expect.arrayContaining(['maleFull', 'femaleFull']));
    expect(keys).not.toContain('appliedMale');
    expect(keys).not.toContain('appliedFemale');
  });

  it('AdminScheduleSchema keeps every public key and adds appliedMale · appliedFemale', () => {
    const adminKeys = Object.keys(AdminScheduleSchema.shape);
    for (const key of Object.keys(PublicScheduleSchema.shape)) {
      expect(adminKeys).toContain(key);
    }
    expect(adminKeys).toEqual(
      expect.arrayContaining(['appliedMale', 'appliedFemale']),
    );
  });
});

describe('MyApplication keeps schedule fields public (SPEC-003 13절 · SPEC-002 12절)', () => {
  it('has no private venue keys or cancel reason under schedule', () => {
    const keys = Object.keys(MyApplicationSchema.shape.schedule.shape);
    for (const key of [
      'venueName',
      'venueAddress',
      'venueDirections',
      'venueMapUrl',
      'cancelReason',
      'meetupId',
    ]) {
      expect(keys).not.toContain(key);
    }
  });
});
