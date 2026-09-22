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
