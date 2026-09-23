import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import type { ApiHttpException } from './api-error.js';
import type { CallerUser } from './current-user.js';
import { ROLES_KEY } from './roles.js';
import { RolesGuard } from './roles.guard.js';
import { fakeExecutionContext, fakeRequest } from './testing/fakes.js';

function adminOnly() {}
Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], adminOnly);
function anyone() {}

function run(user: CallerUser | undefined, handler: () => unknown) {
  const guard = new RolesGuard(new Reflector());
  const request = Object.assign(fakeRequest({ url: '/api/v1/members' }), {
    user,
  });
  try {
    return {
      allowed: guard.canActivate(fakeExecutionContext({ request, handler })),
    };
  } catch (error) {
    return { error: error as ApiHttpException };
  }
}

const id = '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01';

describe('RolesGuard', () => {
  it('passes handlers without @Roles()', () => {
    expect(run({ id, role: 'MEMBER' }, anyone).allowed).toBe(true);
  });

  it('gives 403 FORBIDDEN to a MEMBER on an ADMIN handler and passes an ADMIN', () => {
    const member = run({ id, role: 'MEMBER' }, adminOnly);
    expect(member.error?.getStatus()).toBe(403);
    expect(member.error?.code).toBe('FORBIDDEN');
    expect(run({ id, role: 'ADMIN' }, adminOnly).allowed).toBe(true);
  });

  it('gives 401 when no caller was attached', () => {
    expect(run(undefined, adminOnly).error?.code).toBe('UNAUTHENTICATED');
  });
});
