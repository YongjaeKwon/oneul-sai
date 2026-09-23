import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'oneul-sai:isPublic';

/**
 * 인증(x-user-*)이 필요 없는 핸들러. 내부 토큰(x-internal-token) 검사는 그래도 한다 (SPEC-001 7절 "내부 신뢰 규칙").
 * 어느 엔드포인트가 인증을 요구하는지의 원천은 이 데코레이터다 — Gateway는 경로를 판단하지 않는다.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
