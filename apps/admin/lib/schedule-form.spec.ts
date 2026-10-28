import type { AdminSchedule } from '@oneul-sai/contracts';

import { BIRTH_YEAR_RANGE_MESSAGE } from './errors';
import {
  NOT_A_NUMBER_MESSAGE,
  defaultEndsAt,
  scheduleChanges,
  scheduleFormDefaults,
  scheduleFormSchema,
  scheduleTimeIssues,
  scheduleWarnings,
  startFollowers,
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
  femaleMinBirthYear: null,
  femaleMaxBirthYear: null,
  participantCondition: null,
  priceNote: null,
  minPerGender: null,
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
  receivedMale: 0,
  receivedFemale: 0,
};

function formValues(
  patch: Partial<ScheduleFormValues> = {},
): ScheduleFormValues {
  return {
    ...scheduleFormDefaults(undefined),
    startsAt: '2026-09-27T14:00',
    endsAt: '2026-09-27T16:30',
    applyDeadlineAt: '2026-09-27T14:00',
    priceMale: 30000,
    venueArea: '강남역 인근',
    ...patch,
  };
}

describe('startOfSeoulToday', () => {
  it('builds "오늘 이후" from Seoul midnight', () => {
    expect(startOfSeoulToday(Date.parse('2026-09-26T23:30:00.000Z'))).toBe(
      '2026-09-27T00:00:00+09:00',
    );
  });
});

describe('scheduleFormDefaults (D19)', () => {
  it('leaves start · end · deadline · price empty, prefills 7 · 7 and minimum 5, both checks on', () => {
    expect(scheduleFormDefaults(undefined)).toMatchObject({
      startsAt: '',
      endsAt: '',
      applyDeadlineAt: '',
      samePrice: true,
      priceMale: null,
      priceFemale: null,
      priceNote: '',
      capacityMale: 7,
      capacityFemale: 7,
      minPerGender: 5,
      sameBirthYears: true,
      maleMinBirthYear: null,
      femaleMinBirthYear: null,
      participantCondition: '',
    });
  });

  it('opens the edit form with same price on only when both prices match', () => {
    expect(scheduleFormDefaults(saved).samePrice).toBe(true);
    expect(
      scheduleFormDefaults({ ...saved, priceFemale: 25000 }).samePrice,
    ).toBe(false);
    expect(scheduleFormDefaults(saved).startsAt).toBe('2026-10-04T14:00');
  });

  it('opens the edit form with same range on only when the four values match in pairs', () => {
    const range = {
      maleMinBirthYear: 1990,
      maleMaxBirthYear: 1999,
      femaleMinBirthYear: 1990,
      femaleMaxBirthYear: 1999,
    };
    expect(scheduleFormDefaults(saved).sameBirthYears).toBe(true);
    expect(scheduleFormDefaults({ ...saved, ...range }).sameBirthYears).toBe(
      true,
    );
    expect(
      scheduleFormDefaults({ ...saved, ...range, femaleMaxBirthYear: 1995 })
        .sameBirthYears,
    ).toBe(false);
    expect(
      scheduleFormDefaults({ ...saved, maleMinBirthYear: 1990 }).sameBirthYears,
    ).toBe(false);
  });

  it('keeps the stored values when editing — no defaults over them', () => {
    expect(scheduleFormDefaults(saved)).toMatchObject({
      endsAt: '2026-10-04T16:30',
      minPerGender: null,
      priceNote: '',
      participantCondition: '',
    });
    expect(
      scheduleFormDefaults({
        ...saved,
        minPerGender: 4,
        priceNote: '커피 1잔 포함',
        participantCondition: '90년대생 직장인',
      }),
    ).toMatchObject({
      minPerGender: 4,
      priceNote: '커피 1잔 포함',
      participantCondition: '90년대생 직장인',
    });
  });
});

describe('startFollowers · defaultEndsAt (D19 — 종료 = 시작 + 90분)', () => {
  it('fills end = start + 90 minutes and deadline = start for a new schedule', () => {
    expect(
      startFollowers('2026-10-14T19:30', {
        endsAt: false,
        applyDeadlineAt: false,
      }),
    ).toEqual({
      endsAt: '2026-10-14T21:00',
      applyDeadlineAt: '2026-10-14T19:30',
    });
  });

  it('stops following a field the operator has edited', () => {
    expect(
      startFollowers('2026-10-18T14:00', {
        endsAt: true,
        applyDeadlineAt: false,
      }),
    ).toEqual({ applyDeadlineAt: '2026-10-18T14:00' });
    expect(
      startFollowers('2026-10-18T14:00', {
        endsAt: true,
        applyDeadlineAt: true,
      }),
    ).toEqual({});
  });

  it('crosses midnight in Seoul time under TZ=UTC, and empties with an empty start', () => {
    expect(defaultEndsAt('2026-10-14T23:00')).toBe('2026-10-15T00:30');
    expect(defaultEndsAt('')).toBe('');
    expect(
      startFollowers('', { endsAt: false, applyDeadlineAt: false }),
    ).toEqual({ endsAt: '', applyDeadlineAt: '' });
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

  it('sends the one range to all four fields when same range is on (D16)', () => {
    const result = scheduleFormSchema().parse(
      formValues({
        maleMinBirthYear: 1990,
        maleMaxBirthYear: 1999,
        femaleMinBirthYear: 1980,
        femaleMaxBirthYear: null,
      }),
    );
    expect(result).toMatchObject({
      maleMinBirthYear: 1990,
      maleMaxBirthYear: 1999,
      femaleMinBirthYear: 1990,
      femaleMaxBirthYear: 1999,
    });
  });

  it('sends each range when same range is off', () => {
    const result = scheduleFormSchema().parse(
      formValues({
        sameBirthYears: false,
        maleMinBirthYear: 1990,
        maleMaxBirthYear: 1995,
        femaleMinBirthYear: null,
        femaleMaxBirthYear: 1999,
      }),
    );
    expect(result).toMatchObject({
      maleMinBirthYear: 1990,
      maleMaxBirthYear: 1995,
      femaleMinBirthYear: null,
      femaleMaxBirthYear: 1999,
    });
  });

  it('sends the new optional fields, and empty text as null', () => {
    expect(
      scheduleFormSchema().parse(
        formValues({
          priceNote: '커피 1잔 포함',
          participantCondition: '90년대생 직장인',
        }),
      ),
    ).toMatchObject({
      priceNote: '커피 1잔 포함',
      participantCondition: '90년대생 직장인',
      minPerGender: 5,
    });
    expect(
      scheduleFormSchema().parse(
        formValues({ priceNote: '  ', minPerGender: null }),
      ),
    ).toMatchObject({
      priceNote: null,
      participantCondition: null,
      minPerGender: null,
    });
  });

  it('puts the birth-year order error on each gender’s first year field', () => {
    const paths = (values: ScheduleFormValues) =>
      scheduleFormSchema()
        .safeParse(values)
        .error?.issues.filter(
          (issue) => issue.message === BIRTH_YEAR_RANGE_MESSAGE,
        )
        .map((issue) => issue.path.join('.'));
    expect(
      paths(
        formValues({
          sameBirthYears: false,
          maleMinBirthYear: 1990,
          maleMaxBirthYear: 1995,
          femaleMinBirthYear: 1999,
          femaleMaxBirthYear: 1990,
        }),
      ),
    ).toEqual(['femaleMinBirthYear']);
    // 켜진 채면 여성 쌍은 남성 값을 옮긴 것이라 숨은 여성 칸에도 붙는다 — 체크를 끌 때 화면이 그 오류를 지운다
    expect(
      paths(formValues({ maleMinBirthYear: 1995, maleMaxBirthYear: 1990 })),
    ).toEqual(['maleMinBirthYear', 'femaleMinBirthYear']);
    expect(
      paths(formValues({ maleMinBirthYear: 1990, maleMaxBirthYear: 1990 })),
    ).toBeUndefined();
    // 한쪽만 넣으면 순서 오류가 아니다("비우면 그 성별은 제한이 없습니다.")
    expect(
      paths(formValues({ maleMinBirthYear: 1990, maleMaxBirthYear: null })),
    ).toBeUndefined();
    expect(
      paths(
        formValues({
          sameBirthYears: false,
          femaleMinBirthYear: 1999,
          femaleMaxBirthYear: null,
        }),
      ),
    ).toBeUndefined();
    expect(
      paths(
        formValues({
          sameBirthYears: false,
          femaleMinBirthYear: null,
          femaleMaxBirthYear: 1990,
        }),
      ),
    ).toBeUndefined();
  });

  it('sends the four birth-year fields when a same-range edit changes the male years (A8 · D16)', () => {
    const result = scheduleFormSchema(saved).parse({
      ...scheduleFormDefaults(saved),
      maleMinBirthYear: 1990,
      maleMaxBirthYear: 1999,
    });
    expect(scheduleChanges(result, saved)).toEqual({
      maleMinBirthYear: 1990,
      maleMaxBirthYear: 1999,
      femaleMinBirthYear: 1990,
      femaleMaxBirthYear: 1999,
    });
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
    femaleMinBirthYear: null,
    femaleMaxBirthYear: null,
    participantCondition: null,
    priceNote: null,
    minPerGender: null,
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

  it('sends the four birth-year fields together when a same-range edit changes them', () => {
    expect(
      scheduleChanges(
        {
          ...unchanged,
          maleMinBirthYear: 1990,
          maleMaxBirthYear: 1999,
          femaleMinBirthYear: 1990,
          femaleMaxBirthYear: 1999,
          minPerGender: 5,
          priceNote: '커피 1잔 포함',
        },
        saved,
      ),
    ).toEqual({
      maleMinBirthYear: 1990,
      maleMaxBirthYear: 1999,
      femaleMinBirthYear: 1990,
      femaleMaxBirthYear: 1999,
      minPerGender: 5,
      priceNote: '커피 1잔 포함',
    });
  });
});

describe('scheduleWarnings (D2 · D17 · D19)', () => {
  const base = { capacityMale: 7, capacityFemale: 7, minPerGender: 5 };

  // "일요일이 아닙니다."는 지웠다 — 수요일 회차가 정상 운영이다(D19)
  it('does not warn about the weekday', () => {
    const saturday = { ...base, startsAt: '2026-10-03T14:00:00+09:00' };
    expect(scheduleWarnings(saturday)).toEqual([]);
  });

  it('warns about different capacities and a minimum above a capacity', () => {
    expect(scheduleWarnings({ ...base, capacityFemale: 6 })).toEqual([
      '남녀 정원이 다릅니다.',
    ]);
    expect(scheduleWarnings({ ...base, minPerGender: 8 })).toEqual([
      '최소 인원이 정원보다 큽니다.',
    ]);
    expect(
      scheduleWarnings({ capacityMale: 7, capacityFemale: 4, minPerGender: 5 }),
    ).toEqual(['남녀 정원이 다릅니다.', '최소 인원이 정원보다 큽니다.']);
    expect(
      scheduleWarnings({ capacityMale: 4, capacityFemale: 7, minPerGender: 5 }),
    ).toEqual(['남녀 정원이 다릅니다.', '최소 인원이 정원보다 큽니다.']);
  });

  it('does not warn when the minimum equals the capacity or is empty', () => {
    expect(scheduleWarnings({ ...base, minPerGender: 7 })).toEqual([]);
    expect(scheduleWarnings({ ...base, minPerGender: null })).toEqual([]);
  });

  it('only warns about the fields an edit changed', () => {
    const over = { ...base, minPerGender: 8 };
    expect(scheduleWarnings(over, { priceMale: 1 })).toEqual([]);
    expect(scheduleWarnings(over, { minPerGender: 8 })).toEqual([
      '최소 인원이 정원보다 큽니다.',
    ]);
    expect(scheduleWarnings(over, { capacityMale: 7 })).toEqual([
      '최소 인원이 정원보다 큽니다.',
    ]);
  });
});
