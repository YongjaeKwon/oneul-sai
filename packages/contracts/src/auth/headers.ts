// SPEC-001 7절 "내부 신뢰 규칙". Gateway ↔ 서비스 사이에만 흐르는 헤더.

/** Gateway가 모든 요청에서 이 접두사의 헤더를 먼저 지운 뒤, Bearer 검증에 성공했을 때만 자기 값을 채운다. */
export const INTERNAL_HEADER_PREFIX = 'x-user-';
/** 검증된 호출자의 회원 ID(UUID). */
export const HEADER_USER_ID = 'x-user-id';
/** 검증된 호출자의 역할(`MemberRole`). */
export const HEADER_USER_ROLE = 'x-user-role';
/** Gateway가 프록시하는 모든 요청에 붙이는 공유 비밀(env `INTERNAL_API_TOKEN`). 서비스는 이 값이 맞는 요청만 받는다. */
export const HEADER_INTERNAL_TOKEN = 'x-internal-token';
