/** `GET /api/v1/members/me` 캐시 키. `AuthProvider`가 로그인 · 부팅 refresh 응답의 `member`로 미리 채운다. */
export const meKey = ['me'] as const;
