import {
  API_ERROR_CODES,
  SCHEDULE_MAX_DURATION_MINUTES,
  SCHEDULE_MAX_LEAD_DAYS,
  type ApiErrorCode,
  type ScheduleStatus,
} from '@oneul-sai/contracts';

// SPEC-002 10절 "schedule-rules": 순수 함수(Nest · Prisma 없음, `now`를 인자로 받는다).
// 저장된 값 · 요청 시각에 따라 달라지는 규칙을 판정한다(D14). 정적 형식은 contracts의 Zod가 이미 봤다.

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const TIME_FIELDS = ['startsAt', 'endsAt', 'applyDeadlineAt'] as const;
export type TimeField = (typeof TIME_FIELDS)[number];

export interface ScheduleTimes {
  startsAt: Date;
  endsAt: Date;
  applyDeadlineAt: Date;
}

/** 성별 연령대(출생연도 범위) — 성별마다 한 쌍. 없거나 null이면 그쪽 제한이 없다(D16). */
export interface BirthYearRanges {
  maleMinBirthYear?: number | null;
  maleMaxBirthYear?: number | null;
  femaleMinBirthYear?: number | null;
  femaleMaxBirthYear?: number | null;
}

type WithDates<T> = { [K in keyof T]: K extends TimeField ? Date : T[K] };

/** 요청의 시각 문자열(ISO + offset)을 `Date`로 바꾼다. 보내지 않은 필드는 그대로 없다. */
export function withDates<T extends Partial<Record<TimeField, string>>>(
  input: T,
): WithDates<T> {
  const out: Record<string, unknown> = { ...input };
  for (const field of TIME_FIELDS) {
    const value = input[field];
    if (value !== undefined) out[field] = new Date(value);
  }
  return out as WithDates<T>;
}

/** PATCH에서 저장된 값과 **다른** 필드 이름. 보내지 않은 필드(undefined)는 빠진다. 시각은 가리키는 순간으로 비교한다. */
export function changedFields<P extends object>(
  stored: Record<keyof P, unknown>,
  patch: P,
): (keyof P)[] {
  return (Object.keys(patch) as (keyof P)[]).filter((key) => {
    const next = patch[key];
    const prev = stored[key];
    if (next === undefined) return false;
    return next instanceof Date && prev instanceof Date
      ? next.getTime() !== prev.getTime()
      : next !== prev;
  });
}

/**
 * 시간 규칙(D7): `applyDeadlineAt ≤ startsAt < endsAt`, 진행 ≤ 720분.
 * `changed`(이번 요청으로 값이 바뀌는 시각)만 `now` 이후 · `now + 365일` 이하여야 한다 — 같은 값을 다시 보내면(과거여도) 보지 않는다.
 */
export function isValidScheduleTime(
  times: ScheduleTimes,
  changed: readonly Date[],
  now: Date,
): boolean {
  const start = times.startsAt.getTime();
  const end = times.endsAt.getTime();
  const nowMs = now.getTime();
  return (
    times.applyDeadlineAt.getTime() <= start &&
    start < end &&
    end - start <= SCHEDULE_MAX_DURATION_MINUTES * MINUTE_MS &&
    changed.every(
      (time) =>
        time.getTime() >= nowMs &&
        time.getTime() <= nowMs + SCHEDULE_MAX_LEAD_DAYS * DAY_MS,
    )
  );
}

/** 한 쌍의 `min ≤ max`. 한쪽만 있거나 둘 다 없으면 통과. */
function isOrdered(min?: number | null, max?: number | null): boolean {
  return min == null || max == null || min <= max;
}

/** 병합한 성별 연령대가 성별마다 `min ≤ max`(D16). 남녀 사이의 관계는 보지 않는다. */
export function isValidBirthYearRanges(range: BirthYearRanges): boolean {
  return (
    isOrdered(range.maleMinBirthYear, range.maleMaxBirthYear) &&
    isOrdered(range.femaleMinBirthYear, range.femaleMaxBirthYear)
  );
}

export type ScheduleRuleViolation =
  | typeof API_ERROR_CODES.SCHEDULE_TIME_INVALID
  | typeof API_ERROR_CODES.BIRTH_YEAR_RANGE_INVALID;

/**
 * 생성 · 수정 · 여러 회차 등록의 규칙 판정(병합한 값). `changed`는 값이 바뀐 필드 이름 — 생성은 `TIME_FIELDS` 전부.
 * 여러 회차 등록은 항목마다 같은 `now`로 부른다(D15, 새 규칙 없음).
 * 참가 조건 · 참가비 보조 문구 · 최소 인원으로는 아무것도 판정하지 않는다 — 최소 인원과 정원의 비교도 운영자 화면 몫이다(D17).
 */
export function scheduleRuleViolation(
  values: ScheduleTimes & BirthYearRanges,
  changed: readonly PropertyKey[],
  now: Date,
): ScheduleRuleViolation | null {
  const changedTimes = TIME_FIELDS.filter((field) =>
    changed.includes(field),
  ).map((field) => values[field]);
  if (!isValidScheduleTime(values, changedTimes, now)) {
    return API_ERROR_CODES.SCHEDULE_TIME_INVALID;
  }
  if (!isValidBirthYearRanges(values)) {
    return API_ERROR_CODES.BIRTH_YEAR_RANGE_INVALID;
  }
  return null;
}

/** 6절 전이 표의 열: 상태 요청 셋, 삭제, 필드 수정. */
export type ScheduleAction =
  'OPEN' | 'CLOSED' | 'CANCELLED' | 'DELETE' | 'PATCH';

export type TransitionDecision =
  | { kind: 'change' }
  | { kind: 'noop' }
  | { kind: 'reject'; status: 400 | 409; code: ApiErrorCode };

const CHANGE: TransitionDecision = { kind: 'change' };
const NOOP: TransitionDecision = { kind: 'noop' };
const INVALID: TransitionDecision = {
  kind: 'reject',
  status: 409,
  code: API_ERROR_CODES.INVALID_STATUS_TRANSITION,
};
const NOT_EDITABLE: TransitionDecision = {
  kind: 'reject',
  status: 409,
  code: API_ERROR_CODES.SCHEDULE_NOT_EDITABLE,
};
/** → OPEN(공개 · 다시 열기): 신청 마감이 지금 이후일 때만. */
const OPEN_IF_DEADLINE_AHEAD = 'openIfDeadlineAhead';

// SPEC-002 6절 "전이 표 (현재 상태 × 요청)" 20칸 그대로. 13절 표 기반 테스트가 모두 대조한다.
const TRANSITIONS: Record<
  ScheduleStatus,
  Record<ScheduleAction, TransitionDecision | typeof OPEN_IF_DEADLINE_AHEAD>
> = {
  DRAFT: {
    OPEN: OPEN_IF_DEADLINE_AHEAD,
    CLOSED: INVALID,
    CANCELLED: CHANGE,
    DELETE: CHANGE,
    PATCH: CHANGE,
  },
  OPEN: {
    OPEN: NOOP,
    CLOSED: CHANGE,
    CANCELLED: CHANGE,
    DELETE: NOT_EDITABLE,
    PATCH: CHANGE,
  },
  CLOSED: {
    OPEN: OPEN_IF_DEADLINE_AHEAD,
    CLOSED: NOOP,
    CANCELLED: CHANGE,
    DELETE: NOT_EDITABLE,
    PATCH: CHANGE,
  },
  CANCELLED: {
    OPEN: INVALID,
    CLOSED: INVALID,
    CANCELLED: NOOP,
    DELETE: NOT_EDITABLE,
    PATCH: NOT_EDITABLE,
  },
};

/** 현재 상태에서 요청을 받아들일지. PATCH의 필드 규칙(시간 · 연령대)은 `scheduleRuleViolation`이 따로 본다. */
export function decideTransition(
  current: ScheduleStatus,
  action: ScheduleAction,
  applyDeadlineAt: Date,
  now: Date,
): TransitionDecision {
  const cell = TRANSITIONS[current][action];
  if (cell !== OPEN_IF_DEADLINE_AHEAD) return cell;
  return applyDeadlineAt.getTime() > now.getTime()
    ? CHANGE
    : {
        kind: 'reject',
        status: 400,
        code: API_ERROR_CODES.SCHEDULE_TIME_INVALID,
      };
}
