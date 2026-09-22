import { createHash, timingSafeEqual } from 'node:crypto';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_PREFIX } from '@oneul-sai/constants';
import {
  API_ERROR_CODES,
  HEADER_INTERNAL_TOKEN,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
  MemberIdSchema,
  MemberRoleSchema,
} from '@oneul-sai/contracts';
import type { IncomingHttpHeaders } from 'node:http';
import { apiError, requestPathname } from '../../common/api-error.js';
import type {
  CallerUser,
  RequestWithUser,
} from '../decorators/current-user.js';
import { IS_PUBLIC_KEY } from '../decorators/public.js';

/** 길이가 달라도 시간이 같도록 두 값의 SHA-256을 비교한다. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
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
 * SPEC-001 7절 "내부 신뢰 규칙" (전역 가드).
 * (1) `/api/**`의 모든 핸들러(`@Public()` 포함)에서 `x-internal-token`을 가장 먼저 확인한다 — 실패 → 401 INTERNAL_TOKEN_INVALID.
 *     `/health` · `/docs`는 `/api/v1` 밖이며 검사하지 않는다(K8s 프로브가 서비스를 직접 부른다).
 * (2) `@Public()`이 아닌 핸들러는 `x-user-id`(UUID) · `x-user-role`(MemberRole)이 있을 때만 통과 — 아니면 401 UNAUTHENTICATED.
 *     서비스는 `Authorization` 헤더를 보지 않는다.
 */
export class InternalAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly internalToken: string,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!requestPathname(request).startsWith(`${API_PREFIX}/`)) {
      return true;
    }

    const presented = request.headers[HEADER_INTERNAL_TOKEN];
    if (
      typeof presented !== 'string' ||
      !safeEqual(presented, this.internalToken)
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
