import { ApiClientError } from '@oneul-sai/api-client';
import { API_ERROR_CODES } from '@oneul-sai/contracts';

// SPEC-001 4절 · 7절의 화면 문구. 클라이언트는 `code`로만 분기하고 서버의 `message`는 쓰지 않는다.

const SESSION_ENDED_MESSAGE = '로그인이 만료되었습니다. 다시 로그인해 주세요.';

const MESSAGES_BY_CODE: Partial<Record<string, string>> = {
  [API_ERROR_CODES.VALIDATION_FAILED]: '입력 내용을 확인해 주세요.',
  [API_ERROR_CODES.UNAUTHENTICATED]:
    '로그인이 필요합니다. 다시 로그인해 주세요.',
  [API_ERROR_CODES.TOKEN_EXPIRED]: SESSION_ENDED_MESSAGE,
  [API_ERROR_CODES.INVALID_CREDENTIALS]:
    '이메일 또는 비밀번호가 맞지 않습니다.',
  [API_ERROR_CODES.INVALID_REFRESH_TOKEN]: SESSION_ENDED_MESSAGE,
  [API_ERROR_CODES.REFRESH_TOKEN_EXPIRED]: SESSION_ENDED_MESSAGE,
  [API_ERROR_CODES.REFRESH_TOKEN_REUSED]: SESSION_ENDED_MESSAGE,
  [API_ERROR_CODES.FORBIDDEN]: '운영자 권한이 없습니다.',
  [API_ERROR_CODES.ROLE_NOT_ALLOWED]: '운영자 계정이 아닙니다.',
  [API_ERROR_CODES.ORIGIN_NOT_ALLOWED]:
    '허용되지 않은 접속 경로입니다. 운영자 웹 주소로 다시 접속해 주세요.',
  [API_ERROR_CODES.ACCOUNT_SUSPENDED]:
    '이용이 정지된 계정입니다. 오늘사이에 문의해 주세요.',
  [API_ERROR_CODES.MEMBER_NOT_FOUND]: '회원을 찾을 수 없습니다.',
  [API_ERROR_CODES.SELF_STATUS_CHANGE]: '자기 계정의 상태는 바꿀 수 없습니다.',
  [API_ERROR_CODES.INVALID_STATUS_TRANSITION]:
    '탈퇴한 회원의 상태는 바꿀 수 없습니다.',
  [API_ERROR_CODES.TOO_MANY_REQUESTS]:
    '요청이 많아 잠시 후 다시 시도해 주세요.',
  [API_ERROR_CODES.SERVICE_BUSY]:
    '지금 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
};

export const NETWORK_ERROR_MESSAGE =
  '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
const SERVER_ERROR_MESSAGE =
  '서버에 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.';
const FALLBACK_MESSAGE =
  '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

/** 에러를 화면 문구로 바꾼다. `overrides`는 화면별 예외 문구(코드 → 문구). */
export function describeError(
  error: unknown,
  overrides: Partial<Record<string, string>> = {},
): string {
  if (!isApiClientError(error)) {
    return NETWORK_ERROR_MESSAGE;
  }
  if (error.code !== undefined) {
    const message = overrides[error.code] ?? MESSAGES_BY_CODE[error.code];
    if (message !== undefined) {
      return message;
    }
  }
  return error.status >= 500 ? SERVER_ERROR_MESSAGE : FALLBACK_MESSAGE;
}

// ----- 모임 상품 · 회차 (SPEC-002 4절 "운영자 화면 오류 문구") -----

const STATE_CHANGED_MESSAGE =
  '지금 상태에서는 할 수 없는 작업입니다. 화면을 새로 고쳐 주세요.';

const EVENT_MESSAGES_BY_CODE: Partial<Record<string, string>> = {
  [API_ERROR_CODES.VALIDATION_FAILED]: '입력한 내용을 확인해 주세요.',
  // 폼 검사를 통과했는데 서버가 거절한 저장(다른 운영자의 동시 수정 등). 상태 요청은 STATUS_TIME_INVALID_MESSAGE.
  [API_ERROR_CODES.SCHEDULE_TIME_INVALID]:
    '일시가 맞지 않습니다. 화면을 새로 고친 뒤 다시 저장해 주세요.',
  [API_ERROR_CODES.BIRTH_YEAR_RANGE_INVALID]:
    '남성 연령대의 앞 연도가 뒤 연도보다 클 수 없습니다.',
  [API_ERROR_CODES.MEETUP_NOT_FOUND]:
    '찾을 수 없는 모임 상품입니다. 목록에서 다시 골라 주세요.',
  [API_ERROR_CODES.SCHEDULE_NOT_FOUND]:
    '찾을 수 없는 회차입니다. 이미 삭제되었을 수 있습니다.',
  [API_ERROR_CODES.INVALID_STATUS_TRANSITION]: STATE_CHANGED_MESSAGE,
  [API_ERROR_CODES.SCHEDULE_NOT_EDITABLE]: STATE_CHANGED_MESSAGE,
};

/** 공개 · 다시 열기(→ OPEN)가 신청 마감이 지나 400 `SCHEDULE_TIME_INVALID`일 때. */
export const STATUS_TIME_INVALID_MESSAGE =
  '신청 마감이 지나 공개할 수 없습니다. 신청 마감을 바꾼 뒤 다시 눌러 주세요.';

/** 모임 상품 · 회차 화면의 에러 문구. 401 · 403은 SPEC-001 admin 규칙 그대로, 5xx · 네트워크는 한 문구. */
export function describeEventError(
  error: unknown,
  overrides: Partial<Record<string, string>> = {},
): string {
  if (!isApiClientError(error) || error.status >= 500) {
    return FALLBACK_MESSAGE;
  }
  return describeError(error, { ...EVENT_MESSAGES_BY_CODE, ...overrides });
}
