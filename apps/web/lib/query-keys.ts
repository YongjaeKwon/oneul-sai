/** `GET /api/v1/members/me` 캐시 키. `AuthProvider`가 로그인 · 부팅 refresh 응답의 `member`로 미리 채운다. */
export const meKey = ['me'] as const;

/** `GET /api/v1/applications` 캐시 키의 앞부분(뒤에 조회 조건). 신청 · 취소 뒤 이 키 아래를 모두 무효화한다. */
export const myApplicationsKey = ['my-applications'] as const;
