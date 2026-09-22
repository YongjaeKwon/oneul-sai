import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_ERROR_CODES, type MemberRole } from '@oneul-sai/contracts';
import { apiError } from '../../common/api-error.js';
import type { RequestWithUser } from '../decorators/current-user.js';
import { ROLES_KEY } from '../decorators/roles.js';

/** `@Roles('ADMIN')` 핸들러에서 역할이 맞지 않으면 403 `FORBIDDEN` (SPEC-001 12절 인가 매트릭스). `InternalAuthGuard` 뒤에 돈다. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<MemberRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (roles === undefined || roles.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) {
      throw apiError(
        401,
        API_ERROR_CODES.UNAUTHENTICATED,
        '로그인이 필요합니다.',
      );
    }
    if (!roles.includes(user.role)) {
      throw apiError(403, API_ERROR_CODES.FORBIDDEN, '권한이 없습니다.');
    }
    return true;
  }
}
