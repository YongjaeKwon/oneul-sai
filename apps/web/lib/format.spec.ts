import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  formatDateTime,
  formatFee,
  formatMaleAgeRange,
  formatPrice,
  formatTimeRange,
  isRecruitmentClosed,
  normalizePage,
  scheduleBadgeLabel,
} from './format';

// SPEC-002 13절 단위 "web 표시 도우미". vitest.config.mts가 TZ=UTC로 돌린다 — 서버(UTC)에서도 서울 시각이어야 한다.

describe('formatPrice (D3)', () => {
  it('shows one amount when men and women pay the same', () => {
    expect(formatPrice(30_000, 30_000)).toBe('참가비 30,000원');
    expect(formatPrice(0, 0)).toBe('참가비 0원');
  });

  it('shows both amounts when they differ, including 0', () => {
    expect(formatPrice(30_000, 25_000)).toBe(
      '참가비 남 30,000원 · 여 25,000원',
    );
    expect(formatPrice(0, 25_000)).toBe('참가비 남 0원 · 여 25,000원');
  });
});

describe('formatMaleAgeRange (D5)', () => {
  it.each([
    [1990, 1995, '남성 1990~1995년생'],
    [1990, null, '남성 1990년생부터'],
    [null, 1995, '남성 1995년생까지'],
    [null, null, ''],
  ])('%s ~ %s → "%s"', (min, max, expected) => {
    expect(formatMaleAgeRange(min, max)).toBe(expected);
  });
});

describe('date and time in Seoul regardless of the server zone (D7)', () => {
  it('formats 2026-10-04T05:00Z as the Seoul Sunday 14:00', () => {
    expect(formatDateTime('2026-10-04T05:00:00.000Z')).toBe('10/4(일) 14:00');
  });

  it('puts the date on the end only when the Seoul date changes', () => {
    expect(
      formatTimeRange('2026-10-04T05:00:00.000Z', '2026-10-04T07:30:00.000Z'),
    ).toBe('10/4(일) 14:00~16:30');
    // 서울 23:00 시작 → 다음 날 01:00 종료
    expect(
      formatTimeRange('2026-10-04T14:00:00.000Z', '2026-10-04T16:00:00.000Z'),
    ).toBe('10/4(일) 23:00~10/5(월) 01:00');
  });
});

describe('isRecruitmentClosed (D8)', () => {
  const deadline = '2026-10-03T14:00:00.000Z';
  const before = Date.parse(deadline) - 1;
  const at = Date.parse(deadline);

  it('is closed when the operator closed it, even before the deadline', () => {
    expect(
      isRecruitmentClosed(
        { status: 'CLOSED', applyDeadlineAt: deadline },
        before,
      ),
    ).toBe(true);
  });

  it('is closed for an OPEN schedule once the deadline has come', () => {
    expect(
      isRecruitmentClosed({ status: 'OPEN', applyDeadlineAt: deadline }, at),
    ).toBe(true);
  });

  it('is recruiting for an OPEN schedule before the deadline', () => {
    expect(
      isRecruitmentClosed(
        { status: 'OPEN', applyDeadlineAt: deadline },
        before,
      ),
    ).toBe(false);
  });
});

describe('normalizePage', () => {
  it.each(['abc', '0', '-1', '1.5', '1001', undefined, ['2', '3']])(
    '%j → 1',
    (value) => {
      expect(normalizePage(value)).toBe(1);
    },
  );

  it('keeps a valid page', () => {
    expect(normalizePage('3')).toBe(3);
    expect(normalizePage('1000')).toBe(1000);
  });
});

describe('scheduleBadgeLabel — only "모집 마감" (SPEC-003 ★S2: no seat badges)', () => {
  const now = Date.parse('2026-10-01T00:00:00.000Z');
  const open = {
    status: 'OPEN',
    applyDeadlineAt: '2026-10-03T15:00:00.000Z',
  } as const;

  it('shows nothing while recruiting', () => {
    expect(scheduleBadgeLabel(open, now)).toBeNull();
  });

  it('shows 모집 마감 when closed by the operator or from the deadline on', () => {
    expect(scheduleBadgeLabel({ ...open, status: 'CLOSED' }, now)).toBe(
      '모집 마감',
    );
    expect(
      scheduleBadgeLabel(open, Date.parse('2026-10-03T15:00:00.000Z')),
    ).toBe('모집 마감');
  });
});

describe('application status labels and tones (SPEC-003 S7 · SPEC-004 K)', () => {
  it('has the four statuses with the foundation Badge tones', () => {
    expect(APPLICATION_STATUS_LABELS).toEqual({
      APPLIED: '접수',
      PENDING: '입금 대기',
      CONFIRMED: '참가 확정',
      CANCELLED: '취소',
    });
    expect(APPLICATION_STATUS_TONES).toEqual({
      APPLIED: 'neutral',
      PENDING: 'warning',
      CONFIRMED: 'success',
      CANCELLED: 'danger',
    });
  });
});

describe('formatFee (D6)', () => {
  it('shows the amount fixed at application time', () => {
    expect(formatFee(25_000)).toBe('참가비 25,000원');
  });
});
