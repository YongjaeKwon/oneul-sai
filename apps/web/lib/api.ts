import { ApiClient } from '@oneul-sai/api-client';

/**
 * 참가자 웹의 유일한 API 클라이언트(SPEC-001 4절 "참가자 웹" · 7절 "클라이언트").
 *
 * - `client: 'WEB'` — login · refresh · logout 본문의 `client`가 되어 서비스가 `onulsai_rt_web` 쿠키만 읽는다(R1).
 *   운영자 웹과 한 브라우저에 함께 로그인돼 있어도 서로 간섭하지 않는다.
 * - `credentials: 'include'` — httpOnly refresh 쿠키가 Gateway로 실린다.
 *
 * access token은 이 인스턴스의 메모리에만 있다(D4). 새로 고침 뒤에는 `AuthProvider`가 `refresh()`로 다시 채운다.
 * `NEXT_PUBLIC_*`는 빌드 시점에 인라인되므로 여기와 서버 공개 조회(`lib/public-api.ts`)만 `process.env`를 읽는다.
 */
export const apiClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  client: 'WEB',
  credentials: 'include',
});

/**
 * 입금 계좌 안내 문자열(SPEC-004 ★D) — 운영자가 "{은행} {계좌번호} ({예금주})"를 한 문자열로 준다. 빌드 시점에 인라인되는
 * 공개 설정이라 로그인하지 않은 사람도 번들에서 읽을 수 있다(★D 알아 둘 점 (2)). 비어 있으면 안내를 숨긴다 — 쓰는 곳은
 * `lib/applications.ts`의 `depositAccountNote`(입금 대기 · 참가비 0원 초과일 때만).
 */
export const DEPOSIT_ACCOUNT =
  process.env.NEXT_PUBLIC_DEPOSIT_ACCOUNT?.trim() ?? '';
