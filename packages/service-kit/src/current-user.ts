import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { MemberRole } from '@oneul-sai/contracts';
import type { Request } from 'express';

/** Gateway가 검증한 호출자 (`x-user-id` · `x-user-role`). `InternalAuthGuard`가 채운다. */
export interface CallerUser {
  id: string;
  role: MemberRole;
}

export interface RequestWithUser extends Request {
  user?: CallerUser;
}

/** 보호 핸들러에서만 쓴다 — `@Public()` 핸들러에서는 undefined다. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CallerUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new Error('CurrentUser는 보호 핸들러에서만 쓸 수 있다');
    }
    return request.user;
  },
);
