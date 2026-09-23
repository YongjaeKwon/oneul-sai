import { SetMetadata } from '@nestjs/common';
import type { MemberRole } from '@oneul-sai/contracts';

export const ROLES_KEY = 'oneul-sai:roles';

/** 허용 역할. `RolesGuard`가 `x-user-role`과 대조해 403 `FORBIDDEN`을 낸다 (SPEC-001 12절 인가 매트릭스). */
export const Roles = (
  ...roles: MemberRole[]
): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
