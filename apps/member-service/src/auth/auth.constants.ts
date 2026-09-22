// SPEC-001 10절 내부 구조 `auth.constants.ts`. 서비스 내부 상수 — 클라이언트와 공유하는 값(쿠키 이름 · 경로, JWT 클레임)은
// `@oneul-sai/contracts`에 있다.

/** 15분 창 안 시도 순번 k가 이 값 이상이면 검증 전에 기다린다 (5번째 시도부터, D6). */
export const LOGIN_BACKOFF_THRESHOLD = 5;
export const LOGIN_BACKOFF_WINDOW_SECONDS = 900;
export const LOGIN_BACKOFF_MAX_DELAY_SECONDS = 30;

/** 회전 직후 옛 토큰을 다중 탭 경합으로 보는 시간 (D5). */
export const REFRESH_GRACE_SECONDS = 60;
/** 토큰 가족(세션)의 절대 수명. */
export const REFRESH_FAMILY_MAX_AGE_DAYS = 90;
/** 회원당 ACTIVE 가족 상한 — 넘으면 가장 오래된 가족을 REVOKED(LIMIT). */
export const REFRESH_FAMILIES_PER_MEMBER = 10;

/** scrypt 동시 실행 · 대기 큐 상한. 초과 시 503 SERVICE_BUSY (12절 폭주 방어 (b)). */
export const SCRYPT_MAX_CONCURRENCY = 4;
export const SCRYPT_MAX_QUEUE = 32;

/** 탈퇴 시 passwordHash에 덮어쓰는 표식값 — scrypt 형식이 아니라 어떤 비밀번호로도 검증을 통과하지 못한다 (12절). */
export const WITHDRAWN_PASSWORD_HASH = 'withdrawn';

/** 로그인 실패 문구는 이메일 존재 여부와 무관하게 하나다 (12절 이메일 열거 방지). */
export const INVALID_CREDENTIALS_MESSAGE =
  '이메일 또는 비밀번호가 맞지 않습니다.';
/** 탈퇴 · 비밀번호 변경 · 휴대폰 변경의 현재 비밀번호 불일치 문구. */
export const CURRENT_PASSWORD_MISMATCH_MESSAGE = '비밀번호가 맞지 않습니다.';

/**
 * 창 안 실패 n(= `lastFailedLoginAt`이 15분 안일 때의 `failedLoginCount`, 아니면 0)으로 다음 시도(k = n + 1)의 지연(초)을 낸다.
 * `k < 5 ? 0 : min(2^(k−5), 30)` — 5번째 1초, 6번째 2초, …, 10번째부터 30초 (12절).
 */
export function computeBackoffDelaySeconds(
  counters: { failedLoginCount: number; lastFailedLoginAt: Date | null },
  now: Date,
): number {
  const withinWindow =
    counters.lastFailedLoginAt !== null &&
    now.getTime() - counters.lastFailedLoginAt.getTime() <
      LOGIN_BACKOFF_WINDOW_SECONDS * 1000;
  const failuresInWindow = withinWindow ? counters.failedLoginCount : 0;
  const attempt = failuresInWindow + 1;
  if (attempt < LOGIN_BACKOFF_THRESHOLD) return 0;
  return Math.min(
    2 ** (attempt - LOGIN_BACKOFF_THRESHOLD),
    LOGIN_BACKOFF_MAX_DELAY_SECONDS,
  );
}
