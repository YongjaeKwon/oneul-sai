import type { GatewayEnv } from '../env.schema.js';
import { createPrefixPathFilter } from './path-filter.js';

export interface ProxyRoute {
  prefix: string;
  target: string;
  pathFilter: (pathname: string) => boolean;
}

export type ServiceUrls = Pick<
  GatewayEnv,
  | 'MEMBER_SERVICE_URL'
  | 'EVENT_SERVICE_URL'
  | 'MATCHING_SERVICE_URL'
  | 'PAYMENT_SERVICE_URL'
>;

function route(prefix: string, target: string): ProxyRoute {
  return { prefix, target, pathFilter: createPrefixPathFilter(prefix) };
}

/**
 * 순수 라우팅 표(prefix → 서비스). 인증 요구는 서비스의 @Public()이 원천이며 여기에 두지 않는다 (SPEC-001 7절).
 * notification은 외부 API를 노출하지 않는다(이벤트 기반).
 */
export function createProxyRoutes(urls: ServiceUrls): ProxyRoute[] {
  return [
    route('/api/v1/members', urls.MEMBER_SERVICE_URL),
    route('/api/v1/auth', urls.MEMBER_SERVICE_URL),
    route('/api/v1/events', urls.EVENT_SERVICE_URL),
    route('/api/v1/applications', urls.EVENT_SERVICE_URL),
    route('/api/v1/matches', urls.MATCHING_SERVICE_URL),
    route('/api/v1/preferences', urls.MATCHING_SERVICE_URL),
    route('/api/v1/payments', urls.PAYMENT_SERVICE_URL),
  ];
}
