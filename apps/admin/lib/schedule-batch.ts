import {
  API_ERROR_CODES,
  CreateScheduleRequestSchema,
  DEFAULT_CAPACITY_PER_GENDER,
  SCHEDULE_BATCH_MAX,
  SCHEDULE_MAX_LEAD_DAYS,
  type CreateScheduleRequest,
} from '@oneul-sai/contracts';
import { z } from 'zod';

import { describeError, isApiClientError } from './errors';
import { fromSeoulLocal, toSeoulLocal, weekdayOf } from './format';
import {
  DEFAULT_START_TIME,
  ScheduleSharedFieldsShape,
  addDays,
  checkScheduleValues,
  toSharedRequestInput,
  type ScheduleSharedValues,
} from './schedule-form';

// SPEC-002 D15 — 여러 회차 등록(A9)과 여러 회차 공개(A6)의 admin 전용 도우미(7절 "클라이언트").

export const BATCH_LIMIT_MESSAGE = `한 번에 ${SCHEDULE_BATCH_MAX}개까지 등록할 수 있습니다.`;

/** "매주 반복": 첫 날짜부터 7일 간격 `weeks`개. `weeks`가 1~12 정수가 아니면 `null`(폼 오류). */
export function weeklyDates(
  first: string,
  weeks: number | null,
): string[] | null {
  if (
    weeks === null ||
    !Number.isInteger(weeks) ||
    weeks < 1 ||
    weeks > SCHEDULE_BATCH_MAX
  ) {
    return null;
  }
  return Array.from({ length: weeks }, (_, index) => addDays(first, index * 7));
}

/** "행사 N시간 전" → 그 날짜의 신청 마감(서울 벽시계). N = 0이면 시작 시각이다. */
export function deadlineHoursBefore(startsAt: string, hours: number): string {
  return toSeoulLocal(Date.parse(fromSeoulLocal(startsAt)) - hours * 3_600_000);
}

/** 미리보기 표의 한 행. 행마다 고칠 수 있는 칸만 둔다 — 남성 연령대 · 장소 안내는 공통 값을 쓴다. */
export interface BatchRow {
  /** 처음 만든 날짜. 행을 고쳐도 바뀌지 않는 React key · 서버 오류 표시 기준. */
  key: string;
  startsAt: string;
  endsAt: string;
  applyDeadlineAt: string;
  priceMale: number | null;
  priceFemale: number | null;
  capacityMale: number | null;
  capacityFemale: number | null;
  venueArea: string;
}

/** 여러 회차 등록의 공통 값(한 번 입력). 시각은 `HH:mm`. */
export interface BatchCommonValues extends ScheduleSharedValues {
  startTime: string;
  endTime: string;
  hoursBefore: number | null;
}

const HOURS_BEFORE_MAX = SCHEDULE_MAX_LEAD_DAYS * 24;
const TIME_OF_DAY = /^\d{2}:\d{2}$/;

/** 시각 외 필드의 요청 스키마 — 공통 값의 오류가 같은 이름의 칸에 붙는다. */
const SharedRequestSchema = CreateScheduleRequestSchema.omit({
  startsAt: true,
  endsAt: true,
  applyDeadlineAt: true,
});

/** A9 공통 값 검사. 참가비 · 정원 · 연령대 · 장소는 contracts 스키마 그대로, 시각은 "같은 날짜 안에서 시작 < 종료". */
export const BatchCommonSchema = z
  .object({
    startTime: z.string(),
    endTime: z.string(),
    hoursBefore: z.number({ error: '숫자로 입력해 주세요.' }).nullable(),
    ...ScheduleSharedFieldsShape,
  })
  .superRefine((values, ctx) => {
    const add = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (!TIME_OF_DAY.test(values.startTime)) {
      add('startTime', '시작 시각을 입력해 주세요.');
    }
    if (!TIME_OF_DAY.test(values.endTime)) {
      add('endTime', '종료 시각을 입력해 주세요.');
    } else if (values.endTime <= values.startTime) {
      add('endTime', '종료 시각은 시작 시각보다 늦어야 합니다.');
    }
    // 상한이 없으면 아주 큰 값에서 날짜 계산이 깨진다. 서버의 "365일 이내"와 같은 한도
    if (
      values.hoursBefore === null ||
      !Number.isInteger(values.hoursBefore) ||
      values.hoursBefore < 0 ||
      values.hoursBefore > HOURS_BEFORE_MAX
    ) {
      add(
        'hoursBefore',
        `0 이상 ${HOURS_BEFORE_MAX} 이하의 정수로 입력해 주세요.`,
      );
    }
    const shared = SharedRequestSchema.safeParse(toSharedRequestInput(values));
    for (const issue of shared.error?.issues ?? []) {
      ctx.addIssue({
        code: 'custom',
        path: issue.path,
        message: issue.message,
      });
    }
  });

/** A9 공통 값 초기값: 시작 14:00 · 종료 비움 · 신청 마감 0시간 전(= 시작) · 정원 7 · 7(D2 · D6 · D15). */
export function batchCommonDefaults(): BatchCommonValues {
  return {
    startTime: DEFAULT_START_TIME,
    endTime: '',
    hoursBefore: 0,
    samePrice: true,
    priceMale: null,
    priceFemale: null,
    capacityMale: DEFAULT_CAPACITY_PER_GENDER,
    capacityFemale: DEFAULT_CAPACITY_PER_GENDER,
    maleMinBirthYear: null,
    maleMaxBirthYear: null,
    venueArea: '',
    venueName: '',
    venueAddress: '',
    venueDirections: '',
    venueMapUrl: '',
  };
}

/** 날짜 목록 × 공통 값 → 미리보기 행. */
export function buildRows(
  dates: readonly string[],
  common: BatchCommonValues,
): BatchRow[] {
  return dates.map((date) => {
    const startsAt = `${date}T${common.startTime}`;
    return {
      key: date,
      startsAt,
      endsAt: `${date}T${common.endTime}`,
      applyDeadlineAt: deadlineHoursBefore(startsAt, common.hoursBefore ?? 0),
      priceMale: common.priceMale,
      priceFemale: common.samePrice ? common.priceMale : common.priceFemale,
      capacityMale: common.capacityMale,
      capacityFemale: common.capacityFemale,
      venueArea: common.venueArea,
    };
  });
}

export interface RowCheck {
  /** 제출을 막는 문제. */
  errors: string[];
  /** 확인만 하는 경고(일요일 아님 · 남녀 정원 다름). */
  notSunday: boolean;
  capacityDiffers: boolean;
}

export interface RowsCheck {
  byKey: Record<string, RowCheck>;
  /** 모든 행이 통과했을 때만 요청 항목(표 순서). */
  items: CreateScheduleRequest[] | null;
}

/** 행마다 contracts 스키마 · 시간 규칙 · 같은 일시 · 지역 중복을 확인한다(화면 편의 — 판정의 원천은 서버). */
export function checkRows(
  rows: readonly BatchRow[],
  shared: ScheduleSharedValues,
  now: number,
): RowsCheck {
  const byKey: Record<string, RowCheck> = {};
  const items: CreateScheduleRequest[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const check: RowCheck = {
      errors: [],
      notSunday: row.startsAt !== '' && weekdayOf(row.startsAt) !== 0,
      capacityDiffers: row.capacityMale !== row.capacityFemale,
    };
    byKey[row.key] = check;

    const { request, issues } = checkScheduleValues(
      { ...shared, ...row, samePrice: false },
      now,
    );
    check.errors = [...new Set(issues.map((issue) => issue.message))];
    if (request === null) {
      continue;
    }
    const duplicateKey = `${Date.parse(request.startsAt)}|${request.venueArea}`;
    if (seen.has(duplicateKey)) {
      check.errors.push('같은 일시 · 지역의 회차가 이미 표에 있습니다.');
    }
    seen.add(duplicateKey);
    items.push(request);
  }

  const ok =
    rows.length > 0 &&
    rows.length <= SCHEDULE_BATCH_MAX &&
    Object.values(byKey).every((check) => check.errors.length === 0);
  return { byKey, items: ok ? items : null };
}

/** 400 `message`(`items.2.startsAt: 형식, items.5: 시간 규칙`)에서 항목 순번(0부터)을 모두 뽑는다. */
export function extractItemIndexes(message: string): number[] {
  const indexes = new Set<number>();
  for (const match of message.matchAll(/items\.(\d+)/g)) {
    indexes.add(Number(match[1]));
  }
  return [...indexes].sort((a, b) => a - b);
}

// ----- 여러 회차 공개 (A6) -----

export type PublishResult = { ok: true } | { ok: false; message: string };

/** 행 결과 문구(SPEC-002 4절 오류 문구 표 "여러 회차 공개 — 행 결과"). */
export function publishFailureMessage(error: unknown): string {
  if (isApiClientError(error)) {
    if (error.code === API_ERROR_CODES.SCHEDULE_TIME_INVALID) {
      return '신청 마감이 지나 공개하지 못했습니다.';
    }
    if (error.status === 404 || error.status === 409) {
      return '상태가 바뀌어 공개하지 못했습니다. 화면을 새로 고쳐 주세요.';
    }
    if (error.status === 401 || error.status === 403) {
      return describeError(error);
    }
  }
  return '공개하지 못했습니다. 이 회차만 다시 골라 눌러 주세요.';
}

/**
 * 고른 회차를 고른 순서대로 **하나씩** 공개한다(일괄 엔드포인트 없음, D15). 한 행이 실패해도 다음 행을 부르고,
 * 401 · 403이면 남은 회차를 부르지 않고 멈춘다. 같은 상태 요청은 200 no-op이라 다시 눌러도 안전하다.
 */
export async function publishInOrder(
  ids: readonly string[],
  publish: (id: string) => Promise<unknown>,
  onResult: (id: string, result: PublishResult) => void,
): Promise<{ stoppedBy: unknown }> {
  for (const id of ids) {
    try {
      await publish(id);
      onResult(id, { ok: true });
    } catch (error) {
      onResult(id, { ok: false, message: publishFailureMessage(error) });
      if (
        isApiClientError(error) &&
        (error.status === 401 || error.status === 403)
      ) {
        return { stoppedBy: error };
      }
    }
  }
  return { stoppedBy: null };
}
