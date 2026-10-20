import {
  API_ERROR_CODES,
  type MemberProfile,
  type MyApplication,
  type PublicSchedule,
} from '@oneul-sai/contracts';
import type { BadgeTone } from '@oneul-sai/ui';

import { describeError, isApiClientError } from './errors';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  CANCELLED_BY_NOTES,
  EMPTY,
  isRecruitmentClosed,
} from './format';

// SPEC-003(개정 2026-10-14) 4절 "참가자 웹" W9 참가 신청 영역 · W10 내 신청의 판정과 문구, SPEC-004 4절 참가자 문구 K.
// 판정의 원천은 서버다 — 여기는 버튼을 보일지 정하는 화면 편의다(G).

/** W9 (e) 접수 · 입금 대기 카드 제목. */
export const APPLIED_TITLE = '참가 신청이 접수되었습니다.';
/** W9 (e) 참가 확정 카드 제목(SPEC-004 K — 알림톡 원문에서 이름 · 날짜를 뺌). */
export const CONFIRMED_TITLE = '입금이 확인되어 참가가 확정되었습니다.';
/** 접수 카드 안내(S7). */
export const APPLIED_NOTE = '참가 가능 여부는 따로 안내드릴게요.';
export const PENDING_NOTE =
  '입금 확인 전입니다. 확인되면 알림톡으로 알려드릴게요.';
/** 참가 확정 카드 안내(SPEC-004 K — 알림톡 원문). */
export const CONFIRMED_NOTE =
  '정확한 장소와 준비 사항은 행사 전에 다시 안내드릴게요.';
/** 입금 대기 · 신청 마감 뒤(C). */
export const NOT_CANCELLABLE_MESSAGE =
  '신청 마감이 지나 취소할 수 없습니다. 오늘사이에 문의해 주세요.';
/** 참가 확정(SPEC-004 ★A) — 화면과 409 `APPLICATION_CONFIRMED`에 같은 문장. */
export const CONFIRMED_NOT_CANCELLABLE_MESSAGE =
  '참가가 확정된 신청은 직접 취소할 수 없습니다. 오늘사이에 문의해 주세요.';
export const REAPPLY_BLOCKED_MESSAGE =
  '이 일정은 다시 신청할 수 없습니다. 오늘사이에 문의해 주세요.';
export const ADMIN_ACCOUNT_MESSAGE = '운영자 계정으로는 신청할 수 없습니다.';
export const RECRUITMENT_CLOSED_MESSAGE = '모집이 마감되었습니다.';

/** 본인 취소 확인 창 — 한 문장(S7). 접수 · 입금 대기 같은 창. */
export const CANCEL_CONFIRM_MESSAGE = '참가 신청을 취소할까요?';

/**
 * 본인 취소 — 서버 `decideCancel`(SPEC-004 D10)과 한 규칙: 접수는 언제든(S3 — 신청 마감 뒤 · 회차 CLOSED여도),
 * 입금 대기는 신청 마감 전까지(C — 회차가 CLOSED여도), 참가 확정(★A) · 취소는 불가.
 */
export function canCancelMine(
  application: Pick<MyApplication, 'status' | 'schedule'>,
  now: number = Date.now(),
): boolean {
  switch (application.status) {
    case 'APPLIED':
      return true;
    case 'PENDING':
      return now < Date.parse(application.schedule.applyDeadlineAt);
    default:
      return false;
  }
}

/** W9 (e) · W10 카드의 상태별 내용(SPEC-004 13절 목록 2 · 7). */
export interface ApplicationCard {
  /** W9 (e) 제목. 취소된 신청은 W9에 나오지 않는다 — `null`. */
  title: string | null;
  label: string;
  tone: BadgeTone;
  /** 안내 한 줄. 취소면 취소 주체 문구. */
  note: string;
  cancellable: boolean;
  /** "신청 취소" 버튼 대신 보일 문장(입금 대기 마감 뒤 · 참가 확정). 버튼도 문장도 없으면(취소) `null`. */
  cancelBlocked: string | null;
}

export function applicationCard(
  application: Pick<MyApplication, 'status' | 'cancelledBy' | 'schedule'>,
  now: number = Date.now(),
): ApplicationCard {
  const base = {
    label: APPLICATION_STATUS_LABELS[application.status],
    tone: APPLICATION_STATUS_TONES[application.status],
    cancellable: canCancelMine(application, now),
  };
  switch (application.status) {
    case 'APPLIED':
      return {
        ...base,
        title: APPLIED_TITLE,
        note: APPLIED_NOTE,
        cancelBlocked: null,
      };
    case 'PENDING':
      return {
        ...base,
        title: APPLIED_TITLE,
        note: PENDING_NOTE,
        cancelBlocked: base.cancellable ? null : NOT_CANCELLABLE_MESSAGE,
      };
    case 'CONFIRMED':
      return {
        ...base,
        title: CONFIRMED_TITLE,
        note: CONFIRMED_NOTE,
        cancelBlocked: CONFIRMED_NOT_CANCELLABLE_MESSAGE,
      };
    case 'CANCELLED':
      return {
        ...base,
        title: null,
        // CANCELLED면 `cancelledBy`가 있다(DB CHECK). 없으면 빈 값 표기.
        note:
          application.cancelledBy === null
            ? EMPTY
            : CANCELLED_BY_NOTES[application.cancelledBy],
        cancelBlocked: null,
      };
  }
}

/**
 * ★D 입금 계좌 한 줄(SPEC-004 K) — 입금 대기이고 참가비가 0원보다 크고(★E) 설정 값이 있을 때만.
 * 값은 `lib/api.ts`의 `DEPOSIT_ACCOUNT`(빌드 설정 `NEXT_PUBLIC_DEPOSIT_ACCOUNT`). 입금자명 안내는 ★D (2) 규칙이 정해지면 더한다.
 */
export function depositAccountNote(
  application: Pick<MyApplication, 'status' | 'price'>,
  account: string,
): string | null {
  return application.status === 'PENDING' &&
    application.price > 0 &&
    account !== ''
    ? `입금 계좌 ${account}`
    : null;
}

export type ApplyAreaSchedule = Pick<
  PublicSchedule,
  'status' | 'applyDeadlineAt' | 'priceMale' | 'priceFemale'
>;

/** W9 참가 신청 영역의 (d)~(h). (a) 지난 일정 · (b) 확인 중 · (c) 로그인 안 함은 화면이 먼저 거른다. */
export type ApplyAreaState =
  | { kind: 'admin' }
  | { kind: 'loading' }
  | { kind: 'applied'; application: MyApplication; cancellable: boolean }
  | { kind: 'closed' }
  | { kind: 'reapply-blocked' }
  | { kind: 'apply'; price: number };

/**
 * 위에서부터 먼저 맞는 하나(SPEC-003 4절 W9). `mine`은 이 일정의 내 신청(모든 상태) — 운영자 계정은 조회하지 않으므로
 * `undefined`로 넘긴다. (e) 내 활성 신청(접수 · 입금 대기 · 참가 확정 — `CANCELLED`가 아닌 것)은 W9대로 (f)보다 먼저 본다.
 * 연령 · 정원은 보지 않는다(★S1 · ★S2 — 접수는 정원과 무관하고 연령은 운영자 화면에 표시).
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
  const active = mine.find((application) => application.status !== 'CANCELLED');
  if (active !== undefined) {
    return {
      kind: 'applied',
      application: active,
      cancellable: canCancelMine(active, now),
    };
  }
  if (isRecruitmentClosed(schedule, now)) {
    return { kind: 'closed' };
  }
  if (mine.some((application) => application.cancelledBy === 'ADMIN')) {
    return { kind: 'reapply-blocked' };
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
  [API_ERROR_CODES.APPLICATION_CONFIRMED]: CONFIRMED_NOT_CANCELLABLE_MESSAGE,
  [API_ERROR_CODES.APPLICATION_NOT_FOUND]:
    '신청을 찾을 수 없습니다. 화면을 새로 고쳐 주세요.',
};

/**
 * 신청 · 본인 취소의 오류 문구(SPEC-003 4절 "참가자 화면 오류 문구", SPEC-004 K). 5xx · 네트워크는 한 문구,
 * `SERVICE_BUSY`는 web 기존 문구. 401은 부르는 쪽이 세션을 끝낸다(`isSessionEnded`).
 * `SCHEDULE_FULL`은 신청에서 더 나지 않는다(★S2 — 운영자 참가 가능 안내에서만).
 */
export function describeApplicationError(error: unknown): string {
  if (
    isApiClientError(error) &&
    (error.status < 500 || error.code === API_ERROR_CODES.SERVICE_BUSY)
  ) {
    return describeError(error, APPLICATION_MESSAGES);
  }
  return REQUEST_FAILED_MESSAGE;
}
