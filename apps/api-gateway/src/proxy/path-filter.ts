/**
 * http-proxy-middleware v3 `pathFilter`용 prefix 매처.
 *
 * 문자열 · 글롭 대신 함수를 쓰는 이유: v3는 `['/api/v1/members', '/api/v1/members/**']`처럼
 * 일반 문자열과 글롭을 섞은 배열을 거부하고(`ERR_CONTEXT_MATCHER_INVALID_ARRAY`), 단일 문자열은
 * `indexOf === 0`이라 `/api/v1/membersX`까지 잡는다. 함수는 `url.parse(req.originalUrl).pathname`을 받는다.
 */
export function matchesPathPrefix(pathname: unknown, prefix: string): boolean {
  if (typeof pathname !== 'string') {
    return false;
  }
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function createPrefixPathFilter(
  prefix: string,
): (pathname: string) => boolean {
  return (pathname) => matchesPathPrefix(pathname, prefix);
}
