import { z } from 'zod';

import { MemberRoleSchema } from '../member/enums.js';
import type { ClientType } from './enums.js';

// SPEC-001 7절 · 12절. member-service(발급) · api-gateway(검증) · 앱이 같은 값을 봐야 하는 것만 둔다.
// 백오프 · 유예 창 · 가족 상한 같은 서비스 내부 상수는 member-service `auth.constants.ts`에 있다.

/** 앱별 refresh 쿠키 이름. 요청 본문의 `client`가 어느 쿠키를 읽을지 정한다(R1). */
export const REFRESH_COOKIE_NAMES = {
  WEB: 'onulsai_rt_web',
  ADMIN: 'onulsai_rt_admin',
} as const satisfies Record<ClientType, string>;
export type RefreshCookieName = (typeof REFRESH_COOKIE_NAMES)[ClientType];

/** refresh 쿠키의 `Path`. `/auth/password` · `/auth/logout-all` 요청에도 실린다. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** access token(JWT) 고정 클레임 · 알고리즘. Gateway는 이 값과 다르면 401 `UNAUTHENTICATED`. */
export const JWT_ALGORITHM = 'HS256';
export const JWT_ISSUER = 'oneul-sai';
export const JWT_AUDIENCE = 'oneul-sai-api';
/** JWT 헤더 `typ`. */
export const JWT_TYP = 'at+jwt';

/** Gateway가 서명 · `iss` · `aud` · `typ` · `exp` 검증 뒤 `x-user-*`로 넘기기 전에 확인하는 클레임. */
export const AccessTokenClaimsSchema = z.object({
  sub: z.uuid(),
  role: MemberRoleSchema,
});
export type AccessTokenClaims = z.infer<typeof AccessTokenClaimsSchema>;
