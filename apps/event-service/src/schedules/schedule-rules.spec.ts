import { API_ERROR_CODES, type ScheduleStatus } from '@oneul-sai/contracts';
import {
  changedFields,
  decideTransition,
  isValidMaleBirthYearRange,
  isValidScheduleTime,
  scheduleRuleViolation,
  TIME_FIELDS,
  withDates,
  type ScheduleAction,
  type TransitionDecision,
} from './schedule-rules.js';

// SPEC-002 13절 단위: schedule-rules 시간 규칙 · 남성 연령대 순서 · 6절 전이 표 20칸.

const NOW = new Date('2026-10-01T00:00:00.000Z');
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const at = (ms: number) => new Date(NOW.getTime() + ms);

/** 7일 뒤 14:00~17:00, 신청 마감 = 시작 */
const start = at(7 * DAY + 14 * 60 * MINUTE);
const stored = {
  startsAt: start,
  endsAt: new Date(start.getTime() + 3 * 60 * MINUTE),
  applyDeadlineAt: start,
  maleMinBirthYear: null as number | null,
  maleMaxBirthYear: null as number | null,
  venueArea: '성수',
};
const TIME = API_ERROR_CODES.SCHEDULE_TIME_INVALID;
const BIRTH = API_ERROR_CODES.BIRTH_YEAR_RANGE_INVALID;

/** 생성과 같은 판정: 모든 시각이 바뀐 값이다. */
const createCheck = (overrides: Partial<typeof stored>) =>
  scheduleRuleViolation({ ...stored, ...overrides }, TIME_FIELDS, NOW);

/** PATCH와 같은 판정: 저장값과 병합하고 바뀐 필드만 미래 · 선행 상한을 본다. */
function patchCheck(base: typeof stored, patch: Partial<typeof stored>) {
  const fields = changedFields(base, patch);
  return scheduleRuleViolation({ ...base, ...patch }, fields, NOW);
}

describe('schedule-rules — time rules', () => {
  it('passes applyDeadlineAt = startsAt', () => {
    expect(createCheck({})).toBeNull();
  });

  it.each<[string, Partial<typeof stored>]>([
    [
      'applyDeadlineAt = startsAt + 1 minute',
      { applyDeadlineAt: new Date(start.getTime() + MINUTE) },
    ],
    ['startsAt = endsAt', { endsAt: start }],
    ['startsAt > endsAt', { endsAt: new Date(start.getTime() - MINUTE) }],
    [
      'duration 721 minutes',
      { endsAt: new Date(start.getTime() + 721 * MINUTE) },
    ],
  ])('rejects %s', (_label, overrides) => {
    expect(createCheck(overrides)).toBe(TIME);
  });

  it('passes a 720-minute duration', () => {
    expect(
      createCheck({ endsAt: new Date(start.getTime() + 720 * MINUTE) }),
    ).toBeNull();
  });

  it('judges the merged value: stored 14:00~17:00 + endsAt 13:00 only → fails', () => {
    expect(
      patchCheck(stored, { endsAt: new Date(start.getTime() - 60 * MINUTE) }),
    ).toBe(TIME);
  });

  it('rejects a changed time 1 minute in the past', () => {
    expect(patchCheck(stored, { applyDeadlineAt: at(-MINUTE) })).toBe(TIME);
  });

  it('passes a changed time at now + 365 days, rejects + 365 days 1 minute', () => {
    const bounds = (startsAt: Date) => ({
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * MINUTE),
      applyDeadlineAt: NOW,
    });
    const limit = at(365 * DAY);
    expect(isValidScheduleTime(bounds(limit), [limit], NOW)).toBe(true);
    const over = at(365 * DAY + MINUTE);
    expect(isValidScheduleTime(bounds(over), [over], NOW)).toBe(false);
  });

  it('does not check future · lead limits for a resent same value (even in the past)', () => {
    const pastStart = at(-2 * DAY);
    const past = {
      ...stored,
      startsAt: pastStart,
      endsAt: new Date(pastStart.getTime() + 120 * MINUTE),
      applyDeadlineAt: at(-3 * DAY),
    };
    const resent = withDates({ startsAt: pastStart.toISOString() });
    expect(changedFields(past, resent)).toEqual([]);
    expect(patchCheck(past, resent)).toBeNull();
  });

  it('passes a PATCH without time fields (venue only) on a past schedule', () => {
    const pastStart = at(-2 * DAY);
    const past = {
      ...stored,
      startsAt: pastStart,
      endsAt: new Date(pastStart.getTime() + 120 * MINUTE),
      applyDeadlineAt: pastStart,
    };
    expect(patchCheck(past, { venueArea: '강남' })).toBeNull();
  });

  it('compares times by instant: +09:00 and Z of the same moment are unchanged', () => {
    const patch = withDates({ startsAt: '2026-10-08T14:00:00+09:00' });
    const base = { ...stored, startsAt: new Date('2026-10-08T05:00:00Z') };
    expect(changedFields(base, patch)).toEqual([]);
  });
});

describe('schedule-rules — male birth-year range', () => {
  it.each<[string, number | null, number | null, boolean]>([
    ['both null', null, null, true],
    ['min only', 1990, null, true],
    ['max only', null, 1995, true],
    ['min = max', 1990, 1990, true],
    ['min > max', 1996, 1995, false],
  ])('%s', (_label, min, max, valid) => {
    expect(
      isValidMaleBirthYearRange({
        maleMinBirthYear: min,
        maleMaxBirthYear: max,
      }),
    ).toBe(valid);
  });

  it('treats absent fields as no limit (create without the range)', () => {
    expect(isValidMaleBirthYearRange({})).toBe(true);
  });

  it('merges: stored max 1995 + min 1996 only → fails', () => {
    const base = { ...stored, maleMaxBirthYear: 1995 };
    expect(patchCheck(base, { maleMinBirthYear: 1996 })).toBe(BIRTH);
  });

  it('merges: clearing max with null lets min stand alone', () => {
    const base = { ...stored, maleMaxBirthYear: 1995 };
    expect(
      patchCheck(base, { maleMinBirthYear: 1996, maleMaxBirthYear: null }),
    ).toBeNull();
  });
});

describe('schedule-rules — open / reopen needs applyDeadlineAt > now', () => {
  it.each<[ScheduleStatus]>([['DRAFT'], ['CLOSED']])('%s → OPEN', (status) => {
    expect(decideTransition(status, 'OPEN', NOW, NOW)).toEqual({
      kind: 'reject',
      status: 400,
      code: TIME,
    });
    expect(decideTransition(status, 'OPEN', at(MINUTE), NOW)).toEqual({
      kind: 'change',
    });
  });
});

describe('schedule-rules — transition table (SPEC-002 6절, 20 cells)', () => {
  const outcome = (decision: TransitionDecision): string =>
    decision.kind === 'reject'
      ? `${decision.status} ${decision.code}`
      : decision.kind;
  const INVALID = '409 INVALID_STATUS_TRANSITION';
  const NOT_EDITABLE = '409 SCHEDULE_NOT_EDITABLE';

  // 신청 마감이 지금 이후인 회차 기준. 마감이 지난 경우의 → OPEN은 위 describe가 본다.
  it.each<[ScheduleStatus, ScheduleAction, string]>([
    ['DRAFT', 'OPEN', 'change'],
    ['DRAFT', 'CLOSED', INVALID],
    ['DRAFT', 'CANCELLED', 'change'],
    ['DRAFT', 'DELETE', 'change'],
    ['DRAFT', 'PATCH', 'change'],
    ['OPEN', 'OPEN', 'noop'],
    ['OPEN', 'CLOSED', 'change'],
    ['OPEN', 'CANCELLED', 'change'],
    ['OPEN', 'DELETE', NOT_EDITABLE],
    ['OPEN', 'PATCH', 'change'],
    ['CLOSED', 'OPEN', 'change'],
    ['CLOSED', 'CLOSED', 'noop'],
    ['CLOSED', 'CANCELLED', 'change'],
    ['CLOSED', 'DELETE', NOT_EDITABLE],
    ['CLOSED', 'PATCH', 'change'],
    ['CANCELLED', 'OPEN', INVALID],
    ['CANCELLED', 'CLOSED', INVALID],
    ['CANCELLED', 'CANCELLED', 'noop'],
    ['CANCELLED', 'DELETE', NOT_EDITABLE],
    ['CANCELLED', 'PATCH', NOT_EDITABLE],
  ])('%s × %s → %s', (current, action, expected) => {
    expect(outcome(decideTransition(current, action, at(DAY), NOW))).toBe(
      expected,
    );
  });

  it('OPEN → CLOSED is allowed even after the apply deadline', () => {
    expect(decideTransition('OPEN', 'CLOSED', at(-DAY), NOW)).toEqual({
      kind: 'change',
    });
  });
});
