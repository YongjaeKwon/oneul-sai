// access token(JWT) 검증에서 Gateway만 아는 값 (SPEC-001 7절 "JWT 클레임", 12절 "토큰").
// 알고리즘 · iss · aud · typ · 클레임 스키마는 member-service(서명)와 같은 값이어야 하므로 `@oneul-sai/contracts`에 있다.

/** 서명 측과 검증 측의 시계 차이를 허용하는 초 (SPEC-001 7절). */
export const JWT_CLOCK_TOLERANCE_SECONDS = 30;

/**
 * env `JWT_ACCESS_SECRET`(base64)을 HS256 키 바이트로 바꾼다.
 * 서명 측(member-service)도 같은 디코드 바이트를 키로 써야 검증이 맞는다.
 */
export function decodeAccessSecret(base64Secret: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64Secret, 'base64'));
}
