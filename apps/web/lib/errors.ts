import { ApiClientError } from '@oneul-sai/api-client';
import { API_ERROR_CODES } from '@oneul-sai/contracts';

// SPEC-001 4절 "참가자 웹" · 7절 에러 코드 표의 화면 문구.
// 클라이언트는 `code`로만 분기하고 서버의 `message`는 화면에 쓰지 않는다.

export const SESSION_ENDED_MESSAGE =
  '로그인이 만료되었습니다. 다시 로그인해 주세요.';
export const RATE_LIMITED_MESSAGE = '요청이 많아 잠시 후 다시 시도해 주세요.';
export const NETWORK_ERROR_MESSAGE =
  '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
const SERVER_ERROR_MESSAGE =
  '서버에 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.';
const FALLBACK_MESSAGE =
  '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';

const MESSAGES_BY_CODE: Partial<Record<string, string>> = {
  [API_ERROR_CODES.VALIDATION_FAILED]: '입력 내용을 확인해 주세요.',
  [API_ERROR_CODES.AGE_NOT_ALLOWED]:
    '오늘사이는 만 19세 이상만 가입할 수 있습니다.',
  [API_ERROR_CODES.CONSENT_REQUIRED]: '개인정보 수집 · 이용에 동의해 주세요.',
  [API_ERROR_CODES.UNAUTHENTICATED]: SESSION_ENDED_MESSAGE,
  [API_ERROR_CODES.TOKEN_EXPIRED]: SESSION_ENDED_MESSAGE,
  [API_ERROR_CODES.INVALID_CREDENTIALS]:
    '이메일 또는 비밀번호가 맞지 않습니다.',
  [API_ERROR_CODES.INVALID_REFRESH_TOKEN]: SESSION_ENDED_MESSAGE,
  [API_ERROR_CODES.REFRESH_TOKEN_EXPIRED]: SESSION_ENDED_MESSAGE,
  [API_ERROR_CODES.REFRESH_TOKEN_REUSED]: SESSION_ENDED_MESSAGE,
  [API_ERROR_CODES.FORBIDDEN]: '권한이 없습니다.',
  [API_ERROR_CODES.ACCOUNT_SUSPENDED]:
    '이용이 정지된 계정입니다. 오늘사이에 문의해 주세요.',
  [API_ERROR_CODES.EMAIL_ALREADY_EXISTS]:
    '이미 가입된 이메일입니다. 로그인해 주세요.',
  [API_ERROR_CODES.TOO_MANY_REQUESTS]: RATE_LIMITED_MESSAGE,
  [API_ERROR_CODES.SERVICE_BUSY]:
    '지금 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
};

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

/** 로그인 자격 · 현재 비밀번호 불일치(401 `INVALID_CREDENTIALS`). 세션 종료가 아니라 입력 오류다. */
export function isCredentialError(error: unknown): boolean {
  return (
    isApiClientError(error) &&
    error.status === 401 &&
    error.code === API_ERROR_CODES.INVALID_CREDENTIALS
  );
}

/** 보호 요청의 401 중 자격 오류가 아닌 것 — 어떤 401이든 클라이언트는 로그아웃 상태로 본다(SPEC-001 7절). */
export function isSessionEnded(error: unknown): boolean {
  return (
    isApiClientError(error) && error.status === 401 && !isCredentialError(error)
  );
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
