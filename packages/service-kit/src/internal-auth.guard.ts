import { createHash, timingSafeEqual } from 'node:crypto';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  API_ERROR_CODES,
  HEADER_INTERNAL_TOKEN,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
  MemberIdSchema,
  MemberRoleSchema,
} from '@oneul-sai/contracts';
import type { IncomingHttpHeaders } from 'node:http';
import { apiError } from './api-error.js';
import type { CallerUser, RequestWithUser } from './current-user.js';
import { IS_PUBLIC_KEY } from './public.js';

/**
 * 내부 토큰 검사를 건너뛰는 경로 — K8s 프로브가 서비스를 직접 부른다 (SPEC-002 12절 "내부 토큰 검사의 예외").
 * 요청 경로(query 앞)가 이 값과 **글자 그대로 같을 때만** 건너뛴다. 대소문자 · 끝 `/` · 점 세그먼트가 하나라도 다르면
 * 검사한다(fail closed).
 */
export const INTERNAL_AUTH_EXEMPT_PATHS: readonly string[] = Object.freeze([
  '/health',
]);

/**
 * 요청 대상에서 query 앞부분만 뗀 경로. URL 정규화(점 세그먼트 해석, 절대 형식의 호스트 제거)를 하지 않는다 —
 * 정규화한 값으로 판정하면 라우터가 실제로 매칭한 경로와 다른 경로를 보고 예외를 줄 수 있다.
 */
function rawPath(originalUrl: string): string {
  const query = originalUrl.indexOf('?');
  return query === -1 ? originalUrl : originalUrl.slice(0, query);
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** 길이가 달라도 시간이 같도록 두 값의 SHA-256을 비교한다. */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

/** `x-user-id`가 UUID이고 `x-user-role`이 `MemberRole`일 때만 호출자를 돌려준다. */
export function parseCallerHeaders(
  headers: IncomingHttpHeaders,
): CallerUser | null {
  const id = MemberIdSchema.safeParse(headers[HEADER_USER_ID]);
  const role = MemberRoleSchema.safeParse(headers[HEADER_USER_ROLE]);
  if (!id.success || !role.success) return null;
  return { id: id.data, role: role.data };
}

/**
 * SPEC-001 7절 "내부 신뢰 규칙" (전역 가드). 내부 토큰 값은 앱이 넘긴다 — 이 패키지는 env를 읽지 않는다.
 * (1) `INTERNAL_AUTH_EXEMPT_PATHS`를 뺀 모든 핸들러(`@Public()` 포함, 경로 대소문자 · 형식과 무관)에서
 *     `x-internal-token`을 가장 먼저 확인한다 — 실패 → 401 INTERNAL_TOKEN_INVALID (SPEC-002 D10).
 * (2) `@Public()`이 아닌 핸들러는 `x-user-id`(UUID) · `x-user-role`(MemberRole)이 있을 때만 통과 — 아니면 401 UNAUTHENTICATED.
 *     서비스는 `Authorization` 헤더를 보지 않는다.
 */
export class InternalAuthGuard implements CanActivate {
  private readonly tokenDigest: Buffer;

  constructor(
    private readonly reflector: Reflector,
    internalToken: string,
  ) {
    // 빈 토큰이면 빈 헤더를 보낸 요청이 통과한다 — env 검증을 거치지 않은 소비자를 막는다.
    if (internalToken.length < 32) {
      throw new Error(
        'InternalAuthGuard: internalToken must be at least 32 characters',
      );
    }
    this.tokenDigest = sha256(internalToken);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (INTERNAL_AUTH_EXEMPT_PATHS.includes(rawPath(request.originalUrl))) {
      return true;
    }

    const presented = request.headers[HEADER_INTERNAL_TOKEN];
    if (
      typeof presented !== 'string' ||
      !timingSafeEqual(sha256(presented), this.tokenDigest)
    ) {
      throw apiError(
        401,
        API_ERROR_CODES.INTERNAL_TOKEN_INVALID,
        '내부 토큰이 유효하지 않습니다.',
      );
    }

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic === true) {
      return true;
    }

    const user = parseCallerHeaders(request.headers);
    if (user === null) {
      throw apiError(
        401,
        API_ERROR_CODES.UNAUTHENTICATED,
        '로그인이 필요합니다.',
      );
    }
    request.user = user;
    return true;
  }
}
