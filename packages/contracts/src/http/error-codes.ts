// SPEC-001 · SPEC-002 · SPEC-003 · SPEC-004 7절 "에러 코드 표". `ApiErrorResponse.code`에 실리는 기계용 코드.
// 사람이 읽는 `message`와 별개이며, 클라이언트는 이 값으로만 분기한다.

export const API_ERROR_CODES = {
  // 400
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  AGE_NOT_ALLOWED: 'AGE_NOT_ALLOWED',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  SELF_STATUS_CHANGE: 'SELF_STATUS_CHANGE',
  /** 회차 시각 규칙 위반(순서 · 진행 상한 · 바뀐 시각의 미래 · 선행 상한, → OPEN인데 신청 마감 지남). SPEC-002 */
  SCHEDULE_TIME_INVALID: 'SCHEDULE_TIME_INVALID',
  /** 병합한 성별 연령대가 남 · 여 어느 쌍이든 `min > max`(D16). SPEC-002 */
  BIRTH_YEAR_RANGE_INVALID: 'BIRTH_YEAR_RANGE_INVALID',
  // 401
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** access token 만료(Gateway). 클라이언트는 refresh 후 1회 재시도한다. */
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INTERNAL_TOKEN_INVALID: 'INTERNAL_TOKEN_INVALID',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  REFRESH_TOKEN_EXPIRED: 'REFRESH_TOKEN_EXPIRED',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  // 403
  FORBIDDEN: 'FORBIDDEN',
  ROLE_NOT_ALLOWED: 'ROLE_NOT_ALLOWED',
  /** `client: 'ADMIN'` 요청의 `Origin`이 `ADMIN_ORIGIN`과 다름(서비스) / `POST /api/v1/auth/*`의 `Origin`이 `CORS_ORIGINS` 밖(Gateway). */
  ORIGIN_NOT_ALLOWED: 'ORIGIN_NOT_ALLOWED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  // 404
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  MEETUP_NOT_FOUND: 'MEETUP_NOT_FOUND',
  /** 공개 · 신청: 없음 · DRAFT · CANCELLED(같은 본문). 운영자(회차 · 신청 관리): 없음 또는 `scheduleId`가 `meetupId`에 속하지 않음. SPEC-002 · SPEC-003 */
  SCHEDULE_NOT_FOUND: 'SCHEDULE_NOT_FOUND',
  /** 취소: 신청 없음, 회원 경로에서 남의 신청(같은 본문), 운영자 경로에서 그 회차의 신청이 아님. SPEC-003 */
  APPLICATION_NOT_FOUND: 'APPLICATION_NOT_FOUND',
  // 409
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  /** CANCELLED 회차의 필드 수정, DRAFT가 아닌 회차의 삭제. SPEC-002 */
  SCHEDULE_NOT_EDITABLE: 'SCHEDULE_NOT_EDITABLE',
  /** 신청: 회차가 CLOSED이거나 신청 마감이 지남. SPEC-003 */
  APPLICATION_CLOSED: 'APPLICATION_CLOSED',
  /** 신청: 이 회차에 내 활성 신청이 있음. SPEC-003 */
  ALREADY_APPLIED: 'ALREADY_APPLIED',
  /** 신청: 이 회차에 운영자가 취소한 내 신청이 있음. SPEC-003 */
  REAPPLY_NOT_ALLOWED: 'REAPPLY_NOT_ALLOWED',
  /** 신청: 시작 전인 다른 회차에 내 입금 대기 신청이 있음(한 사람당 하나 — 접수는 세지 않는다). SPEC-003 */
  PENDING_APPLICATION_LIMIT: 'PENDING_APPLICATION_LIMIT',
  /** 참가 가능 안내: 그 신청 성별의 자리 잡은 신청 수 ≥ 정원(신청에서는 나지 않는다 — 접수는 정원과 무관). SPEC-003(개정) */
  SCHEDULE_FULL: 'SCHEDULE_FULL',
  /** 본인 취소: 입금 대기이고 신청 마감이 지남(접수에는 나지 않는다). SPEC-003 */
  APPLICATION_NOT_CANCELLABLE: 'APPLICATION_NOT_CANCELLABLE',
  /** 본인 취소: 참가 확정된 신청(마감 전후 모두). SPEC-004 */
  APPLICATION_CONFIRMED: 'APPLICATION_CONFIRMED',
  /** 회차 수정: 새 정원이 그 성별의 자리 잡은 신청 수보다 작음. SPEC-003 */
  CAPACITY_BELOW_APPLICATIONS: 'CAPACITY_BELOW_APPLICATIONS',
  /** 입금 확인: 이 신청에 결제 기록이 이미 있음. SPEC-004 */
  PAYMENT_ALREADY_RECORDED: 'PAYMENT_ALREADY_RECORDED',
  /** 환불 기록: 환불할 수 없음 — 없는 결제 · 이미 환불 · 받은 금액 초과를 가르지 않는다. SPEC-004 */
  PAYMENT_NOT_REFUNDABLE: 'PAYMENT_NOT_REFUNDABLE',
  // 429 (Gateway)
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  // 503
  SERVICE_BUSY: 'SERVICE_BUSY',
} as const;

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
