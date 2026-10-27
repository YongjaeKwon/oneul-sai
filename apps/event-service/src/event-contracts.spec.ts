import { z } from '@oneul-sai/config';
import {
  API_ERROR_CODES,
  APPLICATION_STATUSES,
  AdminApplicationListQuerySchema,
  AdminScheduleListQuerySchema,
  AdminScheduleSchema,
  AdminUpdateApplicationStatusRequestSchema,
  BatchCreateSchedulesRequestSchema,
  CreateApplicationRequestSchema,
  CreateMeetupRequestSchema,
  CreateScheduleRequestSchema,
  eventEnvelopeSchema,
  MeetupListQuerySchema,
  MemberListQuerySchema,
  MyApplicationListQuerySchema,
  MyApplicationSchema,
  PAYMENT_COMPLETED,
  PaymentCompletedPayloadSchema,
  PublicScheduleListQuerySchema,
  PublicScheduleSchema,
  REFUND_POLICY,
  UpdateApplicationStatusRequestSchema,
  UpdateScheduleRequestSchema,
  UpdateScheduleStatusRequestSchema,
  VENUE_MAP_URL_MAX_LENGTH,
  type CreateScheduleRequest,
} from '@oneul-sai/contracts';
import { formatIssues } from '@oneul-sai/service-kit';

import { ApplicationStatus } from './generated/prisma/client.js';

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
    ['status', 'OPEN'],
    ['meetupId', '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01'],
    ['defaultPrice', 39_000],
  ])('rejects the unknown field %s', (key, value) => {
    const message = expectRejected(create({ [key]: value }));
    expect(message).toContain('모르는 필드');
  });
});

describe('CreateScheduleRequest — birth years per gender (D16, 개정 2026-10-14)', () => {
  const BIRTH_YEAR_FIELDS = [
    'maleMinBirthYear',
    'maleMaxBirthYear',
    'femaleMinBirthYear',
    'femaleMaxBirthYear',
  ] as const;

  it.each(BIRTH_YEAR_FIELDS.map((field) => [field]))(
    '%s rejects 1899 · 10000 · 1990.5, accepts 1900 · 9999 · null',
    (field) => {
      for (const year of [1899, 10_000, 1990.5]) {
        expectRejected(create({ [field]: year }));
      }
      for (const year of [1900, 9999, null]) {
        expect(create({ [field]: year }).success).toBe(true);
      }
    },
  );

  it('accepts all four absent', () => {
    expect(create({}).success).toBe(true);
  });
});

describe('CreateScheduleRequest — participantCondition · priceNote · minPerGender (D17, 개정 2026-10-14)', () => {
  it.each([
    ['participantCondition', 100],
    ['priceNote', 50],
  ] as const)('%s: max %i characters pass, one more fails', (field, max) => {
    expect(create({ [field]: '가'.repeat(max) }).success).toBe(true);
    expectRejected(create({ [field]: '가'.repeat(max + 1) }));
  });

  it.each([['participantCondition'], ['priceNote']])(
    '%s: empty · whitespace only (0 after trim) · NUL · U+202E fail, absent · null pass',
    (field) => {
      for (const value of ['', '   ', 'a\u0000b', '직장인\u202e']) {
        expectRejected(create({ [field]: value }));
      }
      expect(create({ [field]: null }).success).toBe(true);
      expect(create({}).success).toBe(true);
    },
  );

  it.each([['participantCondition'], ['priceNote']])(
    '%s: one line — a newline (\\n · \\r) is rejected, a tab passes (7절)',
    (field) => {
      expectRejected(create({ [field]: '첫 줄\n둘째 줄' }));
      expectRejected(create({ [field]: '첫 줄\r둘째 줄' }));
      expect(create({ [field]: '탭\t포함' }).success).toBe(true);
    },
  );

  it('trims surrounding spaces', () => {
    const result = create({ participantCondition: '  90년대생 직장인  ' });
    expect(result.success && result.data.participantCondition).toBe(
      '90년대생 직장인',
    );
  });

  it('minPerGender: 0 · 51 · 1.5 fail, 1 · 50 · 5 · null pass (no relation to capacity)', () => {
    for (const value of [0, 51, 1.5, '5']) {
      expectRejected(create({ minPerGender: value }));
    }
    for (const value of [1, 50, 5, null]) {
      expect(create({ minPerGender: value }).success).toBe(true);
    }
    expect(create({ minPerGender: 8, capacityMale: 7 }).success).toBe(true);
  });

  it('UpdateScheduleRequest clears each of the five with null', () => {
    for (const field of [
      'femaleMinBirthYear',
      'femaleMaxBirthYear',
      'participantCondition',
      'priceNote',
      'minPerGender',
    ]) {
      expect(
        UpdateScheduleRequestSchema.safeParse({ [field]: null }).success,
      ).toBe(true);
    }
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
      femaleMinBirthYear: null,
      femaleMaxBirthYear: null,
      participantCondition: null,
      priceNote: null,
      minPerGender: null,
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
      receivedMale: 0,
      receivedFemale: 0,
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

  it('UpdateApplicationStatusRequest (member) accepts only CANCELLED', () => {
    expect(
      UpdateApplicationStatusRequestSchema.safeParse({ status: 'CANCELLED' })
        .success,
    ).toBe(true);
    for (const body of [
      {},
      { status: 'PENDING' },
      { status: 'APPLIED' },
      { status: 'CANCELLED', reason: 'x' },
    ]) {
      expect(UpdateApplicationStatusRequestSchema.safeParse(body).success).toBe(
        false,
      );
    }
  });

  it('AdminUpdateApplicationStatusRequest accepts PENDING (invite) and CANCELLED only (D16)', () => {
    for (const status of ['PENDING', 'CANCELLED']) {
      expect(
        AdminUpdateApplicationStatusRequestSchema.safeParse({ status }).success,
      ).toBe(true);
    }
    for (const body of [
      {},
      { status: 'APPLIED' },
      { status: 'CONFIRMED' },
      { status: 'PENDING', reason: 'x' },
    ]) {
      expect(
        AdminUpdateApplicationStatusRequestSchema.safeParse(body).success,
      ).toBe(false);
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

  it('AdminApplicationListQuery: default 100, 101 fails, four statuses pass, unknown status fails', () => {
    expect(AdminApplicationListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 100,
    });
    expect(
      AdminApplicationListQuerySchema.safeParse({ pageSize: '101' }).success,
    ).toBe(false);
    for (const status of ['APPLIED', 'PENDING', 'CONFIRMED', 'CANCELLED']) {
      expect(
        AdminApplicationListQuerySchema.safeParse({ status }).success,
      ).toBe(true);
    }
    expect(
      AdminApplicationListQuerySchema.safeParse({ status: 'WAITING' }).success,
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

describe('schedule responses with applications (SPEC-003 D17 · ★S2)', () => {
  const SEAT_KEYS = [
    'appliedMale',
    'appliedFemale',
    'receivedMale',
    'receivedFemale',
    'maleFull',
    'femaleFull',
  ];

  it('PublicScheduleSchema has no application keys at all', () => {
    const keys = Object.keys(PublicScheduleSchema.shape);
    for (const key of SEAT_KEYS) expect(keys).not.toContain(key);
  });

  it('AdminScheduleSchema keeps every public key and adds the six seat values', () => {
    const adminKeys = Object.keys(AdminScheduleSchema.shape);
    for (const key of Object.keys(PublicScheduleSchema.shape)) {
      expect(adminKeys).toContain(key);
    }
    expect(adminKeys).toEqual(expect.arrayContaining(SEAT_KEYS));
  });
});

describe('schedule responses — revision fields (SPEC-002 D17 · D20, 개정 2026-10-14)', () => {
  const PUBLIC_NEW_KEYS = [
    'femaleMinBirthYear',
    'femaleMaxBirthYear',
    'participantCondition',
    'priceNote',
  ];

  it('PublicScheduleSchema has the four new keys and no minPerGender', () => {
    const keys = Object.keys(PublicScheduleSchema.shape);
    expect(keys).toEqual(expect.arrayContaining(PUBLIC_NEW_KEYS));
    expect(keys).not.toContain('minPerGender');
  });

  it('AdminScheduleSchema has minPerGender', () => {
    expect(Object.keys(AdminScheduleSchema.shape)).toContain('minPerGender');
  });
});

describe('REFUND_POLICY (SPEC-002 D18 · site-facts 1절 7번)', () => {
  it('is the site capture of 2026-10-13, four sentences in the site order', () => {
    expect(REFUND_POLICY.version).toBe('2026-10-13');
    expect([...REFUND_POLICY.lines]).toEqual([
      '참가자 사정으로 취소하는 경우, 행사일 4일 전까지는 참가비 전액을 환불해 드립니다.',
      '이후에는 인원 확정 및 행사 준비가 진행되어 환불이 어려운 점 양해 부탁드립니다.',
      '그 외 주최 측 사정으로 행사가 취소되는 경우에도 참가비 전액을 환불해 드립니다.',
      '자세한 환불 기준은 결제 안내 메시지에서 다시 안내드립니다.',
    ]);
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

// SPEC-004 13절 단위: event-service가 소비할 봉투 · payload 계약과 신청 상태 enum.
describe('eventEnvelopeSchema(PaymentCompletedPayloadSchema) (SPEC-004 8절)', () => {
  const schema = eventEnvelopeSchema(PaymentCompletedPayloadSchema);
  const payload = {
    paymentId: '9c2e7d1a-3f4b-4a5c-8d6e-7f8091a2b3c4',
    applicationId: '3b241101-e2bb-4255-8caf-4136c566a962',
    memberId: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
  };
  const envelope = {
    eventId: '1d2e3f40-5a6b-4c7d-8e9f-a0b1c2d3e4f5',
    type: PAYMENT_COMPLETED.type,
    version: PAYMENT_COMPLETED.version,
    occurredAt: '2026-10-07T05:00:00.000Z',
    payload,
  };

  it('accepts an envelope without requestId and with a UUID requestId', () => {
    expect(schema.safeParse(envelope).success).toBe(true);
    expect(
      schema.safeParse({
        ...envelope,
        requestId: '7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-UUID requestId, version 0 · 1.5 and a malformed occurredAt', () => {
    for (const overrides of [
      { requestId: 'req-1' },
      { version: 0 },
      { version: 1.5 },
      { occurredAt: '2026-10-07 05:00' },
      { eventId: 'not-a-uuid' },
      { type: '' },
    ]) {
      expectRejected(schema.safeParse({ ...envelope, ...overrides }));
    }
  });

  it('accepts unknown payload keys and strips them (같은 버전에 더해진 필드)', () => {
    const result = schema.parse({
      ...envelope,
      payload: { ...payload, amount: 39_000 },
    });
    expect(result.payload).toEqual(payload);
  });

  it('rejects a payload missing a field', () => {
    expectRejected(
      schema.safeParse({
        ...envelope,
        payload: {
          paymentId: payload.paymentId,
          applicationId: payload.applicationId,
        },
      }),
    );
  });

  it('with z.unknown() checks only the envelope, whatever the payload', () => {
    const headerOnly = eventEnvelopeSchema(z.unknown());
    for (const anyPayload of [null, 'x', 42, { other: true }]) {
      expect(
        headerOnly.safeParse({ ...envelope, payload: anyPayload }).success,
      ).toBe(true);
    }
    expectRejected(
      headerOnly.safeParse({ ...envelope, version: 0, payload: 'x' }),
    );
  });
});

describe('APPLICATION_STATUSES matches the Prisma enum (SPEC-004 13절 · SPEC-003 D19)', () => {
  it('is PENDING · CANCELLED · CONFIRMED · APPLIED — the ADD VALUE order', () => {
    expect([...APPLICATION_STATUSES]).toEqual([
      'PENDING',
      'CANCELLED',
      'CONFIRMED',
      'APPLIED',
    ]);
  });

  it('has the same values in the same order as the Prisma ApplicationStatus', () => {
    expect(Object.values(ApplicationStatus)).toEqual([...APPLICATION_STATUSES]);
  });
});

describe('API_ERROR_CODES (SPEC-003 13절 단위 (개정))', () => {
  it('no longer has BIRTH_YEAR_OUT_OF_RANGE — age does not gate applications (★S1)', () => {
    expect(Object.keys(API_ERROR_CODES)).not.toContain(
      'BIRTH_YEAR_OUT_OF_RANGE',
    );
  });
});
