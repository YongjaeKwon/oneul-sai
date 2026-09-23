export const API_PREFIX = '/api/v1';

export const HEADER_REQUEST_ID = 'x-request-id';

export const SERVICE_NAMES = {
  apiGateway: 'api-gateway',
  memberService: 'member-service',
  eventService: 'event-service',
  matchingService: 'matching-service',
  notificationService: 'notification-service',
  paymentService: 'payment-service',
} as const;

export type ServiceName = (typeof SERVICE_NAMES)[keyof typeof SERVICE_NAMES];

/**
 * 화면의 날짜 · 시간 표시와 입력 해석 시간대(SPEC-002 D7). web · admin이 값만 공유한다 — 날짜 표시 · 다음 일요일 계산은 각 앱.
 * 서비스 규칙은 시간대를 쓰지 않는다(절대 시각 비교).
 */
export const SERVICE_TIME_ZONE = 'Asia/Seoul';
