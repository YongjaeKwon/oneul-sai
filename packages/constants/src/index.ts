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
