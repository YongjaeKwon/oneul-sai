import {
  REFRESH_COOKIE_NAMES,
  REFRESH_COOKIE_PATH,
  type ClientType,
  type RefreshCookieName,
} from '@oneul-sai/contracts';
import type { CookieOptions, Request, Response } from 'express';

// SPEC-001 7절 "AuthResponse" 쿠키 규칙 (D4).
//   WEB   → onulsai_rt_web   HttpOnly; Secure; SameSite=Lax;    Path=/api/v1/auth; Max-Age=<REFRESH_TTL>
//   ADMIN → onulsai_rt_admin HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=<REFRESH_TTL>
// Domain 속성 없음(응답한 호스트 = Gateway 호스트 전용). 두 쿠키는 호스트 · Path가 같아 브라우저가 늘 둘 다 보내므로
// 서버는 요청 본문 `client`가 가리키는 이름만 읽는다 (R1).

export interface CookieEnv {
  COOKIE_SECURE: boolean;
  /** 초 */
  REFRESH_TTL: number;
}

/** Nest DI 토큰. AuthModule이 env에서 읽어 제공한다 — 컨트롤러가 env.ts를 직접 import하지 않게(단위 테스트에 인증 env가 없다). */
export const COOKIE_ENV = Symbol('COOKIE_ENV');

export function refreshCookieName(client: ClientType): RefreshCookieName {
  return REFRESH_COOKIE_NAMES[client];
}

export function refreshCookieOptions(
  client: ClientType,
  env: CookieEnv,
): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: client === 'ADMIN' ? 'strict' : 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TTL * 1000,
  };
}

export function setRefreshCookie(
  res: Pick<Response, 'cookie'>,
  client: ClientType,
  token: string,
  env: CookieEnv,
): void {
  res.cookie(
    refreshCookieName(client),
    token,
    refreshCookieOptions(client, env),
  );
}

/** `Max-Age=0; Path=/api/v1/auth` (같은 속성으로 지워야 브라우저가 같은 쿠키로 본다). */
export function clearRefreshCookie(
  res: Pick<Response, 'cookie'>,
  client: ClientType,
  env: CookieEnv,
): void {
  res.cookie(refreshCookieName(client), '', {
    ...refreshCookieOptions(client, env),
    maxAge: 0,
  });
}

/** 본문 `client`가 가리키는 이름의 쿠키만 읽는다. 다른 쿠키는 무시한다 (R1). */
export function readRefreshCookie(
  req: Pick<Request, 'headers'>,
  client: ClientType,
): string | undefined {
  const cookies = (req as { cookies?: Record<string, unknown> }).cookies;
  const value = cookies?.[refreshCookieName(client)];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** 두 이름의 쿠키를 모두 읽는다 — logout-all(요청에 실린 이 회원의 쿠키 삭제) · 비밀번호 변경(현재 가족 판정)용. */
export function readAllRefreshCookies(
  req: Pick<Request, 'headers'>,
): Partial<Record<ClientType, string>> {
  const result: Partial<Record<ClientType, string>> = {};
  for (const client of Object.keys(REFRESH_COOKIE_NAMES) as ClientType[]) {
    const token = readRefreshCookie(req, client);
    if (token !== undefined) result[client] = token;
  }
  return result;
}
