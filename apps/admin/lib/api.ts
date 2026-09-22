import { ApiClient } from '@oneul-sai/api-client';

/**
 * 운영자 웹의 유일한 API 클라이언트(SPEC-001 4절 A1 · 7절 "클라이언트").
 *
 * - `client: 'ADMIN'` — login · refresh · logout 본문의 `client`가 되어 서비스가 `onulsai_rt_admin` 쿠키만 읽는다(R1).
 * - `credentials: 'include'` — httpOnly refresh 쿠키가 Gateway로 실린다. 브라우저가 `Origin`을 자동으로 붙이므로
 *   서비스의 `ADMIN_ORIGIN` 확인은 이 앱의 주소(기본 http://localhost:3001)로 통과한다.
 *
 * access token은 이 인스턴스의 메모리에만 있다(D4). 새로 고침 뒤에는 `AuthProvider`가 `refresh()`로 다시 채운다.
 * `NEXT_PUBLIC_*`는 빌드 시점에 인라인되므로 여기서만 `process.env`를 읽는다.
 */
export const apiClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  client: 'ADMIN',
  credentials: 'include',
});
