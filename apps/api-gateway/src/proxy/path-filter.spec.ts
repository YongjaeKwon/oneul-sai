import { createPrefixPathFilter, matchesPathPrefix } from './path-filter.js';
import { createProxyRoutes } from './routes.js';

const MEETUP_ID = '11111111-1111-4111-8111-111111111111';
const SCHEDULE_ID = '22222222-2222-4222-8222-222222222222';

describe('matchesPathPrefix', () => {
  const members = createPrefixPathFilter('/api/v1/members');
  const auth = createPrefixPathFilter('/api/v1/auth');

  it.each([
    ['/api/v1/members', true], // POST /api/v1/members (가입, 끝 슬래시 없음)
    ['/api/v1/members/', true],
    ['/api/v1/members/me', true],
    ['/api/v1/members/11111111-1111-4111-8111-111111111111/status', true],
    ['/api/v1/membersx', false],
    ['/api/v1/member', false],
    ['/api/v1/members-extra/1', false],
    ['/api/v1/auth/login', false],
    ['/health', false],
  ])('/api/v1/members: %s → %s', (pathname, expected) => {
    expect(members(pathname)).toBe(expected);
  });

  it.each([
    ['/api/v1/auth', true],
    ['/api/v1/auth/login', true],
    ['/api/v1/auth/refresh', true],
    ['/api/v1/auth/logout-all', true],
    ['/api/v1/auth/password', true],
    ['/api/v1/authx', false],
    ['/api/v1/members/me', false],
  ])('/api/v1/auth: %s → %s', (pathname, expected) => {
    expect(auth(pathname)).toBe(expected);
  });

  it('http-proxy-middleware가 pathname 대신 null을 넘겨도 false다', () => {
    expect(matchesPathPrefix(null, '/api/v1/members')).toBe(false);
    expect(matchesPathPrefix(undefined, '/api/v1/members')).toBe(false);
  });
});

// 실제 라우팅 표(routes.ts)에서 pathname이 어느 서비스로 가는지 (SPEC-002 7절 Gateway 라우팅 표 변경)
describe('createProxyRoutes', () => {
  const routes = createProxyRoutes({
    MEMBER_SERVICE_URL: 'http://member',
    EVENT_SERVICE_URL: 'http://event',
    MATCHING_SERVICE_URL: 'http://matching',
    PAYMENT_SERVICE_URL: 'http://payment',
  });
  const targetOf = (pathname: string): string | undefined =>
    routes.find((route) => route.pathFilter(pathname))?.target;

  it.each([
    ['/api/v1/meetups', 'http://event'],
    [`/api/v1/meetups/${MEETUP_ID}`, 'http://event'],
    [`/api/v1/meetups/${MEETUP_ID}/schedules`, 'http://event'],
    [`/api/v1/meetups/${MEETUP_ID}/schedules/batch`, 'http://event'],
    [
      `/api/v1/meetups/${MEETUP_ID}/schedules/${SCHEDULE_ID}/status`,
      'http://event',
    ],
    ['/api/v1/events', 'http://event'],
    [`/api/v1/events/${SCHEDULE_ID}`, 'http://event'],
    ['/api/v1/meetupsX', undefined],
    ['/api/v1/meetup', undefined],
    ['/api/v1/members/me', 'http://member'],
  ])('%s → %s', (pathname, expected) => {
    expect(targetOf(pathname)).toBe(expected);
  });
});
