import type { AdminSchedule } from '@oneul-sai/contracts';

import {
  NOT_A_NUMBER_MESSAGE,
  nextSunday,
  scheduleChanges,
  scheduleFormDefaults,
  scheduleFormSchema,
  scheduleTimeIssues,
  scheduleWarnings,
  startOfSeoulToday,
  toNumberOrNull,
  type ScheduleFormValues,
} from './schedule-form';

const NOW = Date.parse('2026-09-23T03:00:00.000Z'); // 2026-09-23(수) 12:00 서울

const saved: AdminSchedule = {
  id: '5b0d7f3e-8a55-4c1e-9d44-0f3f2a1b9c01',
  meetupId: '9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f',
  title: '일요일 카페 소개팅',
  description: '',
  startsAt: '2026-10-04T05:00:00.000Z',
  endsAt: '2026-10-04T07:30:00.000Z',
  applyDeadlineAt: '2026-10-04T05:00:00.000Z',
  priceMale: 30000,
  priceFemale: 30000,
  capacityMale: 7,
  capacityFemale: 7,
  maleMinBirthYear: null,
  maleMaxBirthYear: null,
  venueArea: '강남역 인근',
  venueName: '카페',
  venueAddress: null,
  venueDirections: null,
  venueMapUrl: null,
  status: 'DRAFT',
  cancelReason: null,
  createdAt: '2026-09-20T00:00:00.000Z',
  updatedAt: '2026-09-20T00:00:00.000Z',
  maleFull: false,
  femaleFull: false,
  appliedMale: 0,
  appliedFemale: 0,
};

function formValues(
  patch: Partial<ScheduleFormValues> = {},
): ScheduleFormValues {
  return {
    ...scheduleFormDefaults(undefined, NOW),
    endsAt: '2026-09-27T16:30',
    priceMale: 30000,
    venueArea: '강남역 인근',
    ...patch,
  };
}

describe('nextSunday (D6)', () => {
  it('returns this week’s Sunday from a Monday', () => {
    expect(nextSunday(Date.parse('2026-09-21T03:00:00.000Z'))).toBe(
      '2026-09-27',
    );
  });

  it('returns the Sunday after next when today is Sunday in Seoul (even if it is Saturday in UTC)', () => {
    // 2026-09-26 23:30 UTC = 2026-09-27(일) 08:30 서울
    expect(nextSunday(Date.parse('2026-09-26T23:30:00.000Z'))).toBe(
      '2026-10-04',
    );
  });

  it('builds "오늘 이후" from Seoul midnight', () => {
    expect(startOfSeoulToday(Date.parse('2026-09-26T23:30:00.000Z'))).toBe(
      '2026-09-27T00:00:00+09:00',
    );
  });
});

describe('scheduleFormDefaults', () => {
  it('prefills next Sunday 14:00, deadline = start, 7 · 7, same price on', () => {
    expect(scheduleFormDefaults(undefined, NOW)).toMatchObject({
      startsAt: '2026-09-27T14:00',
      applyDeadlineAt: '2026-09-27T14:00',
      endsAt: '',
      samePrice: true,
      priceMale: null,
      capacityMale: 7,
      capacityFemale: 7,
      maleMinBirthYear: null,
    });
  });

  it('opens the edit form with same price on only when both prices match', () => {
    expect(scheduleFormDefaults(saved, NOW).samePrice).toBe(true);
    expect(
      scheduleFormDefaults({ ...saved, priceFemale: 25000 }, NOW).samePrice,
    ).toBe(false);
    expect(scheduleFormDefaults(saved, NOW).startsAt).toBe('2026-10-04T14:00');
  });
});

describe('scheduleFormSchema → request', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the one price to both fields when same price is on', () => {
    const result = scheduleFormSchema().parse(
      formValues({ priceFemale: 99999 }),
    );
    expect(result.priceMale).toBe(30000);
    expect(result.priceFemale).toBe(30000);
    expect(result.startsAt).toBe('2026-09-27T14:00:00+09:00');
    expect(result.venueName).toBeNull();
  });

  it('sends each price when same price is off', () => {
    const result = scheduleFormSchema().parse(
      formValues({ samePrice: false, priceFemale: 25000 }),
    );
    expect(result.priceMale).toBe(30000);
    expect(result.priceFemale).toBe(25000);
  });

  it('puts contracts and time-rule errors on the field', () => {
    const result = scheduleFormSchema().safeParse(
      formValues({
        priceMale: null,
        applyDeadlineAt: '2026-09-27T15:00',
        venueMapUrl: 'https://evil.example/',
      }),
    );
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join('.'));
    expect(paths).toContain('priceMale');
    expect(paths).toContain('venueMapUrl');
    // 다른 칸이 틀려도 순서 규칙은 바로 알려 준다.
    expect(paths).toContain('applyDeadlineAt');
  });

  // Zod 4는 앞 단계에 이슈가 있으면 transform을 건너뛴다 — 시각 칸이 비어도 다른 칸 오류가 같이 보여야 한다(리뷰)
  it('shows every field error at once, even while a time field is empty', () => {
    const result = scheduleFormSchema().safeParse(
      formValues({ endsAt: '', priceMale: null, venueArea: '' }),
    );
    const paths = result.error?.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining(['endsAt', 'priceMale', 'venueArea']),
    );
  });

  it('says "숫자로 입력해 주세요." for a value that is not a number', () => {
    const result = scheduleFormSchema().safeParse(
      formValues({ maleMinBirthYear: Number.NaN }),
    );
    const issue = result.error?.issues.find(
      (item) => item.path.join('.') === 'maleMinBirthYear',
    );
    expect(issue?.message).toBe(NOT_A_NUMBER_MESSAGE);
  });

  // SPEC-003 D8 — 화면 편의(원천은 서버 409 CAPACITY_BELOW_APPLICATIONS)
  it('blocks a capacity below that gender’s active applications, but accepts equal', () => {
    const applied = { male: 3, female: 5 };
    const below = scheduleFormSchema(undefined, applied).safeParse(
      formValues({ capacityMale: 2, capacityFemale: 5 }),
    );
    expect(
      below.error?.issues.map((issue) => [issue.path.join('.'), issue.message]),
    ).toEqual([
      [
        'capacityMale',
        '정원을 지금 신청 수(3명)보다 작게 줄일 수 없습니다. 신청을 먼저 취소해 주세요.',
      ],
    ]);
    expect(
      scheduleFormSchema(undefined, applied).safeParse(
        formValues({ capacityMale: 3, capacityFemale: 5 }),
      ).success,
    ).toBe(true);
    // 신청 수를 모르는 화면(A7 · A9)은 막지 않는다
    expect(
      scheduleFormSchema().safeParse(formValues({ capacityMale: 2 })).success,
    ).toBe(true);
  });

  it('keeps the contracts message when the capacity is not a number', () => {
    const result = scheduleFormSchema(undefined, {
      male: 3,
      female: 0,
    }).safeParse(formValues({ capacityMale: Number.NaN }));
    const messages = result.error?.issues
      .filter((issue) => issue.path[0] === 'capacityMale')
      .map((issue) => issue.message);
    expect(messages).toEqual([NOT_A_NUMBER_MESSAGE]);
  });
});

describe('toNumberOrNull (정수 칸)', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['30000', 30000],
    [' 7 ', 7],
    ['007', 7],
    ['１２', 12],
  ])('%j → %s', (input, expected) => {
    expect(toNumberOrNull(input)).toBe(expected);
  });

  // 전에는 type=number가 잘못 친 값을 빈 칸(null)으로 넘겨 선택 칸이 소리 없이 비워졌다(리뷰)
  it.each(['19-9', 'abc', 'Infinity', '1e999'])(
    '%j → NaN, not an empty field',
    (input) => {
      expect(Number.isNaN(toNumberOrNull(input))).toBe(true);
    },
  );

  it('keeps numbers and null moved by setValue', () => {
    expect(toNumberOrNull(30000)).toBe(30000);
    expect(toNumberOrNull(null)).toBeNull();
  });
});

describe('scheduleTimeIssues (D7)', () => {
  const base = {
    startsAt: '2026-10-04T14:00:00+09:00',
    endsAt: '2026-10-04T16:30:00+09:00',
    applyDeadlineAt: '2026-10-04T14:00:00+09:00',
  };
  const fields = (issues: { field: string }[]) => issues.map((i) => i.field);

  it('accepts deadline = start < end', () => {
    expect(scheduleTimeIssues(base, NOW)).toEqual([]);
  });

  it('rejects deadline after start, end not after start and over 12 hours', () => {
    expect(
      fields(
        scheduleTimeIssues(
          { ...base, applyDeadlineAt: '2026-10-04T14:01:00+09:00' },
          NOW,
        ),
      ),
    ).toEqual(['applyDeadlineAt']);
    expect(
      fields(
        scheduleTimeIssues(
          { ...base, endsAt: '2026-10-04T14:00:00+09:00' },
          NOW,
        ),
      ),
    ).toEqual(['endsAt']);
    expect(
      scheduleTimeIssues(
        { ...base, endsAt: '2026-10-05T02:01:00+09:00' },
        NOW,
      )[0]?.message,
    ).toBe('진행 시간은 12시간을 넘을 수 없습니다.');
  });

  it('rejects past and over-a-year times, but only changed ones when editing', () => {
    const past = {
      startsAt: '2026-09-20T14:00:00+09:00',
      endsAt: '2026-09-20T16:30:00+09:00',
      applyDeadlineAt: '2026-09-20T14:00:00+09:00',
    };
    expect(fields(scheduleTimeIssues(past, NOW))).toEqual([
      'startsAt',
      'endsAt',
      'applyDeadlineAt',
    ]);
    expect(scheduleTimeIssues(past, NOW, past)).toEqual([]);
    expect(
      scheduleTimeIssues(
        {
          startsAt: '2027-10-04T14:00:00+09:00',
          endsAt: '2027-10-04T16:30:00+09:00',
          applyDeadlineAt: '2027-10-04T14:00:00+09:00',
        },
        NOW,
      )[0]?.message,
    ).toBe('1년 안의 날짜만 넣을 수 있습니다.');
  });
});

describe('scheduleChanges (A8 PATCH)', () => {
  const unchanged = {
    startsAt: '2026-10-04T14:00:00+09:00',
    endsAt: '2026-10-04T16:30:00+09:00',
    applyDeadlineAt: '2026-10-04T05:00:00Z',
    priceMale: 30000,
    priceFemale: 30000,
    capacityMale: 7,
    capacityFemale: 7,
    maleMinBirthYear: null,
    maleMaxBirthYear: null,
    venueArea: '강남역 인근',
    venueName: '카페',
    venueAddress: null,
    venueDirections: null,
    venueMapUrl: null,
  };

  it('sends nothing when every value (times by instant) is the same', () => {
    expect(scheduleChanges(unchanged, saved)).toEqual({});
  });

  // 폼은 분까지만 다룬다 — 초가 있는 저장값(API로 만든 회차)도 손대지 않았으면 바뀐 것이 아니다(리뷰)
  it('treats a stored time with seconds as unchanged within the same minute', () => {
    expect(
      scheduleChanges(unchanged, {
        ...saved,
        startsAt: '2026-10-04T05:00:30.000Z',
      }),
    ).toEqual({});
  });

  it('sends only changed fields, with null for a cleared optional field', () => {
    expect(
      scheduleChanges(
        { ...unchanged, priceMale: 35000, priceFemale: 35000, venueName: null },
        saved,
      ),
    ).toEqual({ priceMale: 35000, priceFemale: 35000, venueName: null });
  });
});

describe('scheduleWarnings (D2 · D6)', () => {
  const sunday = {
    startsAt: '2026-10-04T14:00:00+09:00',
    capacityMale: 7,
    capacityFemale: 7,
  };

  it('warns about a non-Sunday start and different capacities', () => {
    expect(scheduleWarnings(sunday)).toEqual([]);
    expect(
      scheduleWarnings({
        startsAt: '2026-10-03T14:00:00+09:00',
        capacityMale: 7,
        capacityFemale: 6,
      }),
    ).toEqual(['일요일이 아닙니다.', '남녀 정원이 다릅니다.']);
  });

  it('only warns about the fields an edit changed', () => {
    const saturday = { ...sunday, startsAt: '2026-10-03T14:00:00+09:00' };
    expect(scheduleWarnings(saturday, { priceMale: 1 })).toEqual([]);
    expect(scheduleWarnings(saturday, { startsAt: saturday.startsAt })).toEqual(
      ['일요일이 아닙니다.'],
    );
  });
});
