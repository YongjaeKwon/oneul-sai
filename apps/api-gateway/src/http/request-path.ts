import type { Request } from 'express';

/**
 * query string을 뗀 pathname (SPEC-001 7절 · 12절).
 * 운영자 검색어(`?query=010...`)가 응답 · 로그에 남지 않도록 로거 · 예외 필터 · 미들웨어가 모두 이 값을 쓴다.
 */
export function requestPathname(req: Pick<Request, 'originalUrl'>): string {
  return new URL(req.originalUrl, 'http://gateway').pathname;
}
