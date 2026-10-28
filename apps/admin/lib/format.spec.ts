import {
  formatBirthYears,
  formatCapacity,
  formatPrice,
  formatScheduleRange,
  formatScheduleTime,
  fromSeoulLocal,
  scheduleStatusView,
  toSeoulLocal,
} from './format';

describe('시간대 전제', () => {
  it('runs with TZ=UTC so Seoul math cannot lean on the machine zone', () => {
    expect(new Date(0).getTimezoneOffset()).toBe(0);
  });
});

describe('formatPrice (D3)', () => {
  it('shows one amount when male and female are the same', () => {
    expect(formatPrice(30000, 30000)).toBe('참가비 30,000원');
    expect(formatPrice(0, 0)).toBe('참가비 0원');
  });

  it('shows both amounts when they differ', () => {
    expect(formatPrice(30000, 25000)).toBe('참가비 남 30,000원 · 여 25,000원');
    expect(formatPrice(0, 1000000)).toBe('참가비 남 0원 · 여 1,000,000원');
  });

  it('appends the price note only when there is one (D17)', () => {
    expect(formatPrice(40000, 40000, '커피 1잔 포함')).toBe(
      '참가비 40,000원 · 커피 1잔 포함',
    );
    expect(formatPrice(30000, 25000, '커피 1잔 포함')).toBe(
      '참가비 남 30,000원 · 여 25,000원 · 커피 1잔 포함',
    );
    expect(formatPrice(40000, 40000, null)).toBe('참가비 40,000원');
  });
});

describe('formatCapacity (D17)', () => {
  it('adds "최소 N" only when the minimum is set', () => {
    expect(formatCapacity(7, 7, 5)).toBe('정원 남 7 · 여 7 · 최소 5');
    expect(formatCapacity(7, 6, 8)).toBe('정원 남 7 · 여 6 · 최소 8');
    expect(formatCapacity(7, 7, null)).toBe('정원 남 7 · 여 7');
    expect(formatCapacity(7, 7)).toBe('정원 남 7 · 여 7');
  });
});

describe('formatBirthYears (D16)', () => {
  const none = {
    maleMinBirthYear: null,
    maleMaxBirthYear: null,
    femaleMinBirthYear: null,
    femaleMaxBirthYear: null,
  };
  const male = (min: number | null, max: number | null) =>
    formatBirthYears({ ...none, maleMinBirthYear: min, maleMaxBirthYear: max });

  it('covers both ends, one end and none within one gender', () => {
    expect(male(1990, 1995)).toBe('남성 1990~1995년생');
    expect(male(1990, null)).toBe('남성 1990년생부터');
    expect(male(null, 1995)).toBe('남성 1995년생까지');
    expect(male(null, null)).toBe('');
  });

  it('drops the gender word when both genders have the same range', () => {
    expect(
      formatBirthYears({
        maleMinBirthYear: 1990,
        maleMaxBirthYear: 1999,
        femaleMinBirthYear: 1990,
        femaleMaxBirthYear: 1999,
      }),
    ).toBe('1990~1999년생');
    expect(
      formatBirthYears({
        ...none,
        maleMinBirthYear: 1990,
        femaleMinBirthYear: 1990,
      }),
    ).toBe('1990년생부터');
  });

  it('shows both when they differ, and only the gender that has a range', () => {
    expect(
      formatBirthYears({
        maleMinBirthYear: 1990,
        maleMaxBirthYear: 1995,
        femaleMinBirthYear: 1990,
        femaleMaxBirthYear: 1999,
      }),
    ).toBe('남성 1990~1995년생 · 여성 1990~1999년생');
    expect(formatBirthYears({ ...none, femaleMaxBirthYear: 1999 })).toBe(
      '여성 1999년생까지',
    );
    expect(formatBirthYears(none)).toBe('');
  });
});

describe('Seoul date display', () => {
  it('formats "10/4(일) 14:00" in Seoul time under TZ=UTC', () => {
    expect(formatScheduleTime('2026-10-04T05:00:00.000Z')).toBe(
      '10/4(일) 14:00',
    );
  });

  it('formats a range and adds the date when it ends on another day', () => {
    expect(
      formatScheduleRange(
        '2026-10-04T05:00:00.000Z',
        '2026-10-04T07:30:00.000Z',
      ),
    ).toBe('10/4(일) 14:00~16:30');
    expect(
      formatScheduleRange(
        '2026-10-04T05:00:00.000Z',
        '2026-10-04T15:30:00.000Z',
      ),
    ).toBe('10/4(일) 14:00~10/5(월) 00:30');
  });

  it('converts between instants and Seoul wall-clock input values', () => {
    expect(toSeoulLocal('2026-10-04T05:00:00.000Z')).toBe('2026-10-04T14:00');
    expect(toSeoulLocal('2026-10-03T15:00:00.000Z')).toBe('2026-10-04T00:00');
    expect(fromSeoulLocal('2026-10-04T14:00')).toBe(
      '2026-10-04T14:00:00+09:00',
    );
    expect(Date.parse(fromSeoulLocal('2026-10-04T14:00'))).toBe(
      Date.parse('2026-10-04T05:00:00.000Z'),
    );
  });
});

describe('scheduleStatusView (모집 마감 계산)', () => {
  const now = Date.parse('2026-10-01T00:00:00.000Z');
  const before = '2026-10-04T05:00:00.000Z';
  const after = '2026-09-30T05:00:00.000Z';

  it('shows OPEN before the deadline as 모집 중', () => {
    expect(
      scheduleStatusView({ status: 'OPEN', applyDeadlineAt: before }, now),
    ).toEqual({ tone: 'success', label: '모집 중' });
  });

  it('shows OPEN past the deadline as 모집 마감 with the stored status note', () => {
    expect(
      scheduleStatusView({ status: 'OPEN', applyDeadlineAt: after }, now),
    ).toEqual({
      tone: 'neutral',
      label: '모집 마감',
      note: '신청 마감 시각 지남 · 상태: 공개',
    });
  });

  it('maps CLOSED, DRAFT and CANCELLED', () => {
    expect(
      scheduleStatusView({ status: 'CLOSED', applyDeadlineAt: before }, now),
    ).toEqual({ tone: 'neutral', label: '모집 마감' });
    expect(
      scheduleStatusView({ status: 'DRAFT', applyDeadlineAt: before }, now),
    ).toEqual({ tone: 'neutral', label: '비공개' });
    expect(
      scheduleStatusView({ status: 'CANCELLED', applyDeadlineAt: before }, now),
    ).toEqual({ tone: 'danger', label: '취소' });
  });
});
