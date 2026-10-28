import {
  CreateScheduleRequestSchema,
  DEFAULT_CAPACITY_PER_GENDER,
  DEFAULT_MIN_PER_GENDER,
  SCHEDULE_DEFAULT_DURATION_MINUTES,
  SCHEDULE_MAX_DURATION_MINUTES,
  SCHEDULE_MAX_LEAD_DAYS,
  type AdminSchedule,
  type CreateScheduleRequest,
  type UpdateScheduleRequest,
} from '@oneul-sai/contracts';
import { z } from 'zod';

import { BIRTH_YEAR_RANGE_MESSAGE } from './errors';
import { fromSeoulLocal, toSeoulLocal } from './format';

// SPEC-002 4절 A7 · A8 · A9 회차 폼. 형식은 contracts의 `CreateScheduleRequestSchema`가 판정하고,
// 시간 규칙 · 연령대 순서는 화면 편의로 먼저 알려 준다(판정의 원천은 서버 — D14).

/** 회차 폼 · 여러 회차 등록 공통 값이 함께 쓰는 필드. 이름은 요청 필드와 같다. */
export interface ScheduleSharedValues {
  /** "남녀 같은 금액"(D3). 켜져 있으면 `priceMale` 한 칸의 값을 두 필드에 넣어 보낸다. 저장하지 않는다. */
  samePrice: boolean;
  priceMale: number | null;
  priceFemale: number | null;
  priceNote: string;
  capacityMale: number | null;
  capacityFemale: number | null;
  minPerGender: number | null;
  /** "남녀 같은 범위"(D16). 켜져 있으면 남성 한 쌍의 값을 여성 두 필드에도 넣어 보낸다. 저장하지 않는다. */
  sameBirthYears: boolean;
  maleMinBirthYear: number | null;
  maleMaxBirthYear: number | null;
  femaleMinBirthYear: number | null;
  femaleMaxBirthYear: number | null;
  participantCondition: string;
  venueArea: string;
  venueName: string;
  venueAddress: string;
  venueDirections: string;
  venueMapUrl: string;
}

/** A7 · A8 폼 값. 시각은 서울 벽시계 `YYYY-MM-DDTHH:mm`(datetime-local). */
export interface ScheduleFormValues extends ScheduleSharedValues {
  startsAt: string;
  endsAt: string;
  applyDeadlineAt: string;
}

/**
 * 숫자 칸(`inputMode="numeric"` 텍스트 칸)의 `setValueAs`. 빈 칸만 `null`(선택 필드는 비움, 필수 필드는 "입력해 주세요"),
 * 그 밖에는 숫자로 바꾼다 — 전각 숫자('１２')는 반각으로 읽고, "19-9" · "Infinity"처럼 유한한 숫자가 아니면 `NaN`이 되어
 * 빈 값으로 저장되지 않고 "숫자로 입력해 주세요."가 뜬다. `setValue`로 옮긴 값(숫자 · `null`)은 그대로 둔다.
 */
export function toNumberOrNull(value: unknown): number | null {
  if (typeof value !== 'string') {
    return typeof value === 'number' ? value : null;
  }
  const text = value.normalize('NFKC').trim();
  if (text === '') {
    return null;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : Number.NaN;
}

export const NOT_A_NUMBER_MESSAGE = '숫자로 입력해 주세요.';

/** 숫자 칸 값(`NaN` 포함). 여기서는 막지 않고 contracts 검사에서 칸 오류로 알린다 — 모든 칸의 오류가 한 번에 보이게. */
export const numberValue = z.union([z.number(), z.nan()]).nullable();

export const ScheduleSharedFieldsShape = {
  samePrice: z.boolean(),
  priceMale: numberValue,
  priceFemale: numberValue,
  priceNote: z.string(),
  capacityMale: numberValue,
  capacityFemale: numberValue,
  minPerGender: numberValue,
  sameBirthYears: z.boolean(),
  maleMinBirthYear: numberValue,
  maleMaxBirthYear: numberValue,
  femaleMinBirthYear: numberValue,
  femaleMaxBirthYear: numberValue,
  participantCondition: z.string(),
  venueArea: z.string(),
  venueName: z.string(),
  venueAddress: z.string(),
  venueDirections: z.string(),
  venueMapUrl: z.string(),
};

// 시각 칸은 여기서 막지 않는다 — 앞선 이슈가 있으면 Zod 4가 transform을 건너뛰어 다른 칸의 오류가 늦게 보인다.
// 빈 칸 문구는 `checkScheduleValues`가 붙인다.
const ScheduleFormFieldsSchema = z.object({
  startsAt: z.string(),
  endsAt: z.string(),
  applyDeadlineAt: z.string(),
  ...ScheduleSharedFieldsShape,
});

/** 빈 선택 칸은 `null`로 보낸다(빈 문자열은 400 — 7절). */
const emptyToNull = (value: string): string | null =>
  value.trim() === '' ? null : value;

/** 공통 값 → 요청의 시각 외 필드(스키마 검사 전 — 필수 칸이 `null`일 수 있다). */
export function toSharedRequestInput(values: ScheduleSharedValues) {
  return {
    priceMale: values.priceMale,
    priceFemale: values.samePrice ? values.priceMale : values.priceFemale,
    priceNote: emptyToNull(values.priceNote),
    capacityMale: values.capacityMale,
    capacityFemale: values.capacityFemale,
    minPerGender: values.minPerGender,
    maleMinBirthYear: values.maleMinBirthYear,
    maleMaxBirthYear: values.maleMaxBirthYear,
    femaleMinBirthYear: values.sameBirthYears
      ? values.maleMinBirthYear
      : values.femaleMinBirthYear,
    femaleMaxBirthYear: values.sameBirthYears
      ? values.maleMaxBirthYear
      : values.femaleMaxBirthYear,
    participantCondition: emptyToNull(values.participantCondition),
    venueArea: values.venueArea,
    venueName: emptyToNull(values.venueName),
    venueAddress: emptyToNull(values.venueAddress),
    venueDirections: emptyToNull(values.venueDirections),
    venueMapUrl: emptyToNull(values.venueMapUrl),
  };
}

/** 빈 시각 칸은 빈 문자열 그대로 둔다(`checkScheduleValues`가 "입력해 주세요"로 알린다). */
const toApiTime = (local: string): string =>
  local === '' ? '' : fromSeoulLocal(local);

/** 폼 값 → `CreateScheduleRequest` 모양(검사 전). 시각은 서울로 해석해 `+09:00`을 붙인다(A7). */
export function toScheduleRequestInput(values: ScheduleFormValues) {
  return {
    startsAt: toApiTime(values.startsAt),
    endsAt: toApiTime(values.endsAt),
    applyDeadlineAt: toApiTime(values.applyDeadlineAt),
    ...toSharedRequestInput(values),
  };
}

export type TimeField = 'startsAt' | 'endsAt' | 'applyDeadlineAt';
const TIME_FIELDS: readonly TimeField[] = [
  'startsAt',
  'endsAt',
  'applyDeadlineAt',
];

const TIME_REQUIRED_MESSAGES: Record<TimeField, string> = {
  startsAt: '시작 시각을 입력해 주세요.',
  endsAt: '종료 시각을 입력해 주세요.',
  applyDeadlineAt: '신청 마감을 입력해 주세요.',
};

/** 폼이 다루는 분 단위로 같은 시각인지(저장된 값에 초가 있어도 손대지 않은 칸은 같다). */
const sameMinute = (a: string, b: string): boolean =>
  toSeoulLocal(a) === toSeoulLocal(b);

export interface TimeIssue {
  field: TimeField;
  message: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 시간 규칙(D7)을 화면에서 먼저 확인한다. `original`이 있으면(수정) 값이 바뀐 시각만 미래 · 1년 규칙을 본다.
 * 순서: 신청 마감 ≤ 시작 < 종료, 진행 ≤ 12시간.
 */
export function scheduleTimeIssues(
  request: Pick<CreateScheduleRequest, TimeField>,
  now: number,
  original?: Pick<AdminSchedule, TimeField>,
): TimeIssue[] {
  const issues: TimeIssue[] = [];
  const startsAt = Date.parse(request.startsAt);
  const endsAt = Date.parse(request.endsAt);

  if (Date.parse(request.applyDeadlineAt) > startsAt) {
    issues.push({
      field: 'applyDeadlineAt',
      message: '신청 마감은 시작 시각보다 늦을 수 없습니다.',
    });
  }
  if (endsAt <= startsAt) {
    issues.push({
      field: 'endsAt',
      message: '종료 시각은 시작 시각보다 늦어야 합니다.',
    });
  } else if (endsAt - startsAt > SCHEDULE_MAX_DURATION_MINUTES * 60 * 1000) {
    issues.push({
      field: 'endsAt',
      message: '진행 시간은 12시간을 넘을 수 없습니다.',
    });
  }
  for (const field of TIME_FIELDS) {
    if (original !== undefined && sameMinute(original[field], request[field])) {
      continue;
    }
    const time = Date.parse(request[field]);
    if (time < now) {
      issues.push({ field, message: '지난 시각으로는 바꿀 수 없습니다.' });
    } else if (time > now + SCHEDULE_MAX_LEAD_DAYS * DAY_MS) {
      issues.push({ field, message: '1년 안의 날짜만 넣을 수 있습니다.' });
    }
  }
  return issues;
}

export interface FieldIssue {
  path: PropertyKey[];
  message: string;
}

/** contracts 이슈 → 칸 오류. 숫자가 아닌 칸(`NaN`)은 contracts의 "…입력해 주세요." 대신 "숫자로 입력해 주세요."로 알린다. */
export function toFieldIssues(
  error: z.ZodError | undefined,
  input: Record<string, unknown>,
): FieldIssue[] {
  return (error?.issues ?? []).map(({ path, message }) => ({
    path,
    message: Number.isNaN(input[String(path[0])])
      ? NOT_A_NUMBER_MESSAGE
      : message,
  }));
}

/**
 * 연령대 순서(남 · 여 칸마다 앞 연도 ≤ 뒤 연도, D16)를 화면에서 먼저 알린다 — 오류는 앞 연도 칸에. 숫자가 아닌 칸은
 * 형식 오류가 알린다. 판정의 원천은 서버의 병합 결과다(400 `BIRTH_YEAR_RANGE_INVALID`).
 */
export function birthYearOrderIssues(
  input: Pick<
    ReturnType<typeof toSharedRequestInput>,
    | 'maleMinBirthYear'
    | 'maleMaxBirthYear'
    | 'femaleMinBirthYear'
    | 'femaleMaxBirthYear'
  >,
): FieldIssue[] {
  const pairs = [
    ['maleMinBirthYear', input.maleMinBirthYear, input.maleMaxBirthYear],
    ['femaleMinBirthYear', input.femaleMinBirthYear, input.femaleMaxBirthYear],
  ] as const;
  return pairs
    .filter(
      ([, min, max]) =>
        Number.isFinite(min) &&
        Number.isFinite(max) &&
        Number(min) > Number(max),
    )
    .map(([field]) => ({ path: [field], message: BIRTH_YEAR_RANGE_MESSAGE }));
}

/** 성별 값 한 쌍(A8 정원 칸 옆 신청 수 · 저장된 정원). */
export interface AppliedByGender {
  male: number;
  female: number;
}

/**
 * 폼 값 → 요청으로 바꿔 contracts 스키마로 검사하고(필드 이름이 같아 오류가 그 칸에 붙는다), 빈 시각 칸은 "입력해 주세요"로
 * 알린다. 시각 칸이 모두 맞으면 다른 칸의 오류와 상관없이 시간 규칙도 확인한다. 모두 통과해야 `request`가 있다.
 */
export function checkScheduleValues(
  values: ScheduleFormValues,
  now: number,
  original?: AdminSchedule,
): { request: CreateScheduleRequest | null; issues: FieldIssue[] } {
  const input = toScheduleRequestInput(values);
  const parsed = CreateScheduleRequestSchema.safeParse(input);
  const missing = TIME_FIELDS.filter((field) => values[field] === '');
  const issues: FieldIssue[] = [
    ...missing.map((field) => ({
      path: [field],
      message: TIME_REQUIRED_MESSAGES[field],
    })),
    ...toFieldIssues(parsed.error, input).filter(
      (issue) => !missing.some((field) => field === issue.path[0]),
    ),
    ...birthYearOrderIssues(input),
  ];
  const timesWellFormed = !issues.some((issue) =>
    TIME_FIELDS.some((field) => field === issue.path[0]),
  );
  if (timesWellFormed) {
    for (const issue of scheduleTimeIssues(input, now, original)) {
      issues.push({ path: [issue.field], message: issue.message });
    }
  }
  return {
    request: parsed.success && issues.length === 0 ? parsed.data : null,
    issues,
  };
}

/** A7 · A8 폼 스키마. 결과는 `CreateScheduleRequest`(수정이면 `scheduleChanges`로 바꾼 필드만 고른다). */
export function scheduleFormSchema(original?: AdminSchedule) {
  return ScheduleFormFieldsSchema.transform((values, ctx) => {
    const { request, issues } = checkScheduleValues(
      values,
      Date.now(),
      original,
    );
    for (const { path, message } of issues) {
      ctx.issues.push({ code: 'custom', path, message, input: values });
    }
    return request ?? z.NEVER;
  });
}

/** `YYYY-MM-DD`에 날짜를 더한다(달력 계산이라 시간대와 무관). */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** 종료 기본값 = 시작 + 90분(`SCHEDULE_DEFAULT_DURATION_MINUTES`, D19). 서울 벽시계 값. 시작이 비었거나 형식이 아니면 빈 문자열. */
export function defaultEndsAt(startsAt: string): string {
  const start = Date.parse(fromSeoulLocal(startsAt));
  return Number.isNaN(start)
    ? ''
    : toSeoulLocal(start + SCHEDULE_DEFAULT_DURATION_MINUTES * 60_000);
}

/**
 * 새 회차(A7)에서 시작을 바꿀 때 따라 바뀌는 칸: 운영자가 손대지 않은 신청 마감 = 시작, 종료 = 시작 + 90분(D19).
 * 손댄 칸은 더 따라가지 않는다.
 */
export function startFollowers(
  startsAt: string,
  edited: { endsAt: boolean; applyDeadlineAt: boolean },
): Partial<Pick<ScheduleFormValues, 'endsAt' | 'applyDeadlineAt'>> {
  return {
    ...(edited.applyDeadlineAt ? {} : { applyDeadlineAt: startsAt }),
    ...(edited.endsAt ? {} : { endsAt: defaultEndsAt(startsAt) }),
  };
}

/** 오늘(서울) 0시 — 회차 목록의 기본 기간 "오늘 이후"의 `from`. */
export function startOfSeoulToday(now: number): string {
  return fromSeoulLocal(`${toSeoulLocal(now).slice(0, 10)}T00:00`);
}

/** 새 회차 · 여러 회차 등록 공통 값의 시각 외 초기값: 참가비 빈 칸 · 정원 7 · 7 · 최소 인원 5 · 두 체크 켜짐(D2 · D17 · D19). */
export function sharedDefaults(): ScheduleSharedValues {
  return {
    samePrice: true,
    priceMale: null,
    priceFemale: null,
    priceNote: '',
    capacityMale: DEFAULT_CAPACITY_PER_GENDER,
    capacityFemale: DEFAULT_CAPACITY_PER_GENDER,
    minPerGender: DEFAULT_MIN_PER_GENDER,
    sameBirthYears: true,
    maleMinBirthYear: null,
    maleMaxBirthYear: null,
    femaleMinBirthYear: null,
    femaleMaxBirthYear: null,
    participantCondition: '',
    venueArea: '',
    venueName: '',
    venueAddress: '',
    venueDirections: '',
    venueMapUrl: '',
  };
}

/** A7 · A8 폼 초기값. 새 회차는 시각 세 칸이 비어 있다(시작을 넣으면 `startFollowers` — D19). 수정은 저장된 값 그대로. */
export function scheduleFormDefaults(
  schedule: AdminSchedule | undefined,
): ScheduleFormValues {
  if (schedule === undefined) {
    return {
      startsAt: '',
      endsAt: '',
      applyDeadlineAt: '',
      ...sharedDefaults(),
    };
  }
  return {
    startsAt: toSeoulLocal(schedule.startsAt),
    endsAt: toSeoulLocal(schedule.endsAt),
    applyDeadlineAt: toSeoulLocal(schedule.applyDeadlineAt),
    // 저장된 두 값이 같을 때만 켠 채 연다(D3).
    samePrice: schedule.priceMale === schedule.priceFemale,
    priceMale: schedule.priceMale,
    priceFemale: schedule.priceFemale,
    priceNote: schedule.priceNote ?? '',
    capacityMale: schedule.capacityMale,
    capacityFemale: schedule.capacityFemale,
    minPerGender: schedule.minPerGender,
    // 저장된 네 값이 쌍으로 같을 때만 켠 채 연다(D16).
    sameBirthYears:
      schedule.maleMinBirthYear === schedule.femaleMinBirthYear &&
      schedule.maleMaxBirthYear === schedule.femaleMaxBirthYear,
    maleMinBirthYear: schedule.maleMinBirthYear,
    maleMaxBirthYear: schedule.maleMaxBirthYear,
    femaleMinBirthYear: schedule.femaleMinBirthYear,
    femaleMaxBirthYear: schedule.femaleMaxBirthYear,
    participantCondition: schedule.participantCondition ?? '',
    venueArea: schedule.venueArea,
    venueName: schedule.venueName ?? '',
    venueAddress: schedule.venueAddress ?? '',
    venueDirections: schedule.venueDirections ?? '',
    venueMapUrl: schedule.venueMapUrl ?? '',
  };
}

const VALUE_FIELDS = [
  'priceMale',
  'priceFemale',
  'priceNote',
  'capacityMale',
  'capacityFemale',
  'minPerGender',
  'maleMinBirthYear',
  'maleMaxBirthYear',
  'femaleMinBirthYear',
  'femaleMaxBirthYear',
  'participantCondition',
  'venueArea',
  'venueName',
  'venueAddress',
  'venueDirections',
  'venueMapUrl',
] as const;

/** A8 PATCH 본문: 저장된 값과 다른 필드만(시각은 폼과 같은 분 단위로 비교). 비운 선택 필드는 `null`. */
export function scheduleChanges(
  request: CreateScheduleRequest,
  schedule: AdminSchedule,
): UpdateScheduleRequest {
  const changes: Partial<Record<keyof CreateScheduleRequest, unknown>> = {};
  for (const field of TIME_FIELDS) {
    if (!sameMinute(request[field], schedule[field])) {
      changes[field] = request[field];
    }
  }
  for (const field of VALUE_FIELDS) {
    const next = request[field] ?? null;
    if (next !== schedule[field]) {
      changes[field] = next;
    }
  }
  return changes as UpdateScheduleRequest;
}

/** 최소 인원이 어느 성별 정원보다 큰지(D17 — 경고만, 서버는 보지 않는다). 최소 인원이 없으면 거짓. */
export function minAboveCapacity(
  values: Pick<
    CreateScheduleRequest,
    'capacityMale' | 'capacityFemale' | 'minPerGender'
  >,
): boolean {
  const min = values.minPerGender;
  return (
    min != null && (min > values.capacityMale || min > values.capacityFemale)
  );
}

/**
 * 제출 전 확인 문구(경고일 뿐 막지 않는다 — D2 · D17). 수정(`changes` 있음)은 바꾼 칸에 해당하는 경고만 묻는다.
 * 요일은 묻지 않는다(D19).
 */
export function scheduleWarnings(
  request: Pick<
    CreateScheduleRequest,
    'capacityMale' | 'capacityFemale' | 'minPerGender'
  >,
  changes?: UpdateScheduleRequest,
): string[] {
  const touched = (...fields: (keyof UpdateScheduleRequest)[]) =>
    changes === undefined || fields.some((field) => field in changes);
  const warnings: string[] = [];
  if (
    touched('capacityMale', 'capacityFemale') &&
    request.capacityMale !== request.capacityFemale
  ) {
    warnings.push('남녀 정원이 다릅니다.');
  }
  if (
    touched('minPerGender', 'capacityMale', 'capacityFemale') &&
    minAboveCapacity(request)
  ) {
    warnings.push('최소 인원이 정원보다 큽니다.');
  }
  return warnings;
}
