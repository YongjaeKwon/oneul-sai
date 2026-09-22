import { env } from '../env.js';

// notification은 외부 API를 노출하지 않는다(이벤트 기반).
export const proxyRoutes: { pathFilter: string; target: string }[] = [
  { pathFilter: '/api/v1/members/**', target: env.MEMBER_SERVICE_URL },
  { pathFilter: '/api/v1/events/**', target: env.EVENT_SERVICE_URL },
  { pathFilter: '/api/v1/applications/**', target: env.EVENT_SERVICE_URL },
  { pathFilter: '/api/v1/matches/**', target: env.MATCHING_SERVICE_URL },
  { pathFilter: '/api/v1/preferences/**', target: env.MATCHING_SERVICE_URL },
  { pathFilter: '/api/v1/payments/**', target: env.PAYMENT_SERVICE_URL },
];
