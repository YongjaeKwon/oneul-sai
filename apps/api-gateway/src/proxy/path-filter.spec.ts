import { createPrefixPathFilter, matchesPathPrefix } from './path-filter.js';

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
