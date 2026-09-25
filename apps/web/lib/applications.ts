import {
  API_ERROR_CODES,
  type Gender,
  type MemberProfile,
  type MyApplication,
  type PublicSchedule,
} from '@oneul-sai/contracts';

import { describeError, isApiClientError } from './errors';
import {
  formatMaleAgeRange,
  GENDER_LABELS,
  isRecruitmentClosed,
} from './format';

// SPEC-003 4절 "참가자 웹" W9 참가 신청 영역 · W10 내 신청의 판정과 문구.
// 판정의 원천은 서버다 — 여기는 버튼을 보일지 정하는 화면 편의다(G).

export const PENDING_NOTE =
  '입금 확인 전입니다. 확인되면 알림톡으로 알려드릴게요.';
export const NOT_CANCELLABLE_MESSAGE =
  '신청 마감이 지나 취소할 수 없습니다. 오늘사이에 문의해 주세요.';
export const REAPPLY_BLOCKED_MESSAGE =
  '이 일정은 다시 신청할 수 없습니다. 오늘사이에 문의해 주세요.';
export const ADMIN_ACCOUNT_MESSAGE = '운영자 계정으로는 신청할 수 없습니다.';
export const RECRUITMENT_CLOSED_MESSAGE = '모집이 마감되었습니다.';

export const CANCEL_CONFIRM_MESSAGE =
  '참가 신청을 취소할까요? 취소한 뒤에는 자리가 남아 있을 때만 다시 신청할 수 있습니다.';

/** "남성 자리가 모두 찼습니다." — (i)와 409 `SCHEDULE_FULL`. */
export function genderFullMessage(gender: Gender): string {
  return `${GENDER_LABELS[gender]} 자리가 모두 찼습니다.`;
}

/** "이 일정은 남성 1990~1995년생만 신청하실 수 있습니다." — (h)의 본문(SPEC-002 D5 표기). 409 `BIRTH_YEAR_OUT_OF_RANGE`에는 쓰지 않는다(`applicationErrorCopy`). */
export function birthYearRuleMessage(
  min: number | null,
  max: number | null,
): string {
  return `이 일정은 ${formatMaleAgeRange(min, max)}만 신청하실 수 있습니다.`;
}

/**
 * 신청 409 `SCHEDULE_FULL`의 문구를 내 성별로 고른다. `BIRTH_YEAR_OUT_OF_RANGE`는 넣지 않는다 — 연령대 밖이면 (h)가 버튼을
 * 막으므로 버튼으로 이 409가 오는 것은 화면의 일정(서버 렌더, 최대 30초 캐시)이 운영자의 연령대 변경보다 늦을 때뿐이고,
 * 옛 범위로 만든 문장은 비거나 나와 모순된다. 그때는 기본 문구로 둔다(설계서에 없는 문구를 지어내지 않는다).
 */
export function applicationErrorCopy(
  gender: Gender | null,
): Partial<Record<string, string>> {
  return gender === null
    ? {}
    : { [API_ERROR_CODES.SCHEDULE_FULL]: genderFullMessage(gender) };
}

/** 서버 `outsideMaleBirthYears`와 같은 규칙(경계 포함). 범위가 없는 쪽은 열려 있다. */
export function outsideMaleBirthYears(
  schedule: Pick<PublicSchedule, 'maleMinBirthYear' | 'maleMaxBirthYear'>,
  birthYear: number,
): boolean {
  const { maleMinBirthYear: min, maleMaxBirthYear: max } = schedule;
  return (min !== null && birthYear < min) || (max !== null && birthYear > max);
}

/** 본인 취소는 신청 마감 전까지(C). 회차가 모집 마감(CLOSED)이어도 된다. */
export function canCancelMine(
  application: Pick<MyApplication, 'status' | 'schedule'>,
  now: number = Date.now(),
): boolean {
  return (
    application.status === 'PENDING' &&
    now < Date.parse(application.schedule.applyDeadlineAt)
  );
}

export type ApplyAreaSchedule = Pick<
  PublicSchedule,
  | 'status'
  | 'applyDeadlineAt'
  | 'priceMale'
  | 'priceFemale'
  | 'maleMinBirthYear'
  | 'maleMaxBirthYear'
  | 'maleFull'
  | 'femaleFull'
>;

/** W9 참가 신청 영역의 (d)~(j). (a) 지난 일정 · (b) 확인 중 · (c) 로그인 안 함은 화면이 먼저 거른다. */
export type ApplyAreaState =
  | { kind: 'admin' }
  | { kind: 'loading' }
  | { kind: 'applied'; application: MyApplication; cancellable: boolean }
  | { kind: 'closed' }
  | { kind: 'reapply-blocked' }
  | { kind: 'birth-year' }
  | { kind: 'full'; gender: Gender }
  | { kind: 'apply'; price: number };

/**
 * 위에서부터 먼저 맞는 하나(SPEC-003 4절 W9). `mine`은 이 일정의 내 신청(모든 상태) — 운영자 계정은 조회하지 않으므로
 * `undefined`로 넘긴다. (f)~(i)의 순서(모집 마감 → 다시 신청 불가 → 연령 → 만석)는 서버 판정 순서(D7)와 같다.
 * (e) 내 신청은 W9대로 (f)보다 먼저 본다 — 서버는 신청을 받을 때 마감을 먼저 본다.
 */
export function applyAreaState(
  schedule: ApplyAreaSchedule,
  me: Pick<MemberProfile, 'role' | 'gender' | 'birthYear'>,
  mine: readonly MyApplication[] | undefined,
  now: number = Date.now(),
): ApplyAreaState {
  // 성별 · 출생연도가 없는 계정은 운영자뿐이다(SPEC-001).
  if (me.role !== 'MEMBER' || me.gender === null || me.birthYear === null) {
    return { kind: 'admin' };
  }
  if (mine === undefined) {
    return { kind: 'loading' };
  }
  const pending = mine.find((application) => application.status === 'PENDING');
  if (pending !== undefined) {
    return {
      kind: 'applied',
      application: pending,
      cancellable: canCancelMine(pending, now),
    };
  }
  if (isRecruitmentClosed(schedule, now)) {
    return { kind: 'closed' };
  }
  if (mine.some((application) => application.cancelledBy === 'ADMIN')) {
    return { kind: 'reapply-blocked' };
  }
  if (me.gender === 'MALE' && outsideMaleBirthYears(schedule, me.birthYear)) {
    return { kind: 'birth-year' };
  }
  if (me.gender === 'MALE' ? schedule.maleFull : schedule.femaleFull) {
    return { kind: 'full', gender: me.gender };
  }
  return {
    kind: 'apply',
    price: me.gender === 'MALE' ? schedule.priceMale : schedule.priceFemale,
  };
}

const REQUEST_FAILED_MESSAGE =
  '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';

const APPLICATION_MESSAGES: Partial<Record<string, string>> = {
  [API_ERROR_CODES.APPLICATION_CLOSED]: RECRUITMENT_CLOSED_MESSAGE,
  [API_ERROR_CODES.ALREADY_APPLIED]: '이미 신청한 일정입니다.',
  [API_ERROR_CODES.REAPPLY_NOT_ALLOWED]: REAPPLY_BLOCKED_MESSAGE,
  [API_ERROR_CODES.PENDING_APPLICATION_LIMIT]:
    '입금 대기 중인 다른 신청이 있습니다. 그 신청이 확정되거나 취소된 뒤에 신청해 주세요. 오늘사이에 문의해 주세요.',
  [API_ERROR_CODES.SCHEDULE_NOT_FOUND]:
    '신청할 수 없는 일정입니다. 일정 목록에서 다시 골라 주세요.',
  [API_ERROR_CODES.FORBIDDEN]: ADMIN_ACCOUNT_MESSAGE,
  [API_ERROR_CODES.APPLICATION_NOT_CANCELLABLE]: NOT_CANCELLABLE_MESSAGE,
  [API_ERROR_CODES.APPLICATION_NOT_FOUND]:
    '신청을 찾을 수 없습니다. 화면을 새로 고쳐 주세요.',
};

/**
 * 신청 · 본인 취소의 오류 문구(SPEC-003 4절 "참가자 화면 오류 문구"). `extra`는 내 성별로 고르는 `SCHEDULE_FULL` 문구
 * (`applicationErrorCopy`). 5xx · 네트워크는 한 문구, `SERVICE_BUSY`는 web 기존 문구.
 * 401은 부르는 쪽이 세션을 끝낸다(`isSessionEnded`).
 */
export function describeApplicationError(
  error: unknown,
  extra: Partial<Record<string, string>> = {},
): string {
  if (
    isApiClientError(error) &&
    (error.status < 500 || error.code === API_ERROR_CODES.SERVICE_BUSY)
  ) {
    return describeError(error, { ...APPLICATION_MESSAGES, ...extra });
  }
  return REQUEST_FAILED_MESSAGE;
}
