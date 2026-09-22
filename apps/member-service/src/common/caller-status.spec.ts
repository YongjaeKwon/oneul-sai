import { ApiHttpException } from './api-error.js';
import { assertCallerUsable } from './caller-status.js';

function failure(
  member: { status: 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN' } | null,
) {
  try {
    assertCallerUsable(member);
  } catch (error) {
    return error as ApiHttpException;
  }
  return undefined;
}

describe('assertCallerUsable', () => {
  it('passes ACTIVE', () => {
    expect(failure({ status: 'ACTIVE' })).toBeUndefined();
  });

  it('turns WITHDRAWN and a missing row into 401 UNAUTHENTICATED', () => {
    for (const member of [{ status: 'WITHDRAWN' as const }, null]) {
      const error = failure(member);
      expect(error).toBeInstanceOf(ApiHttpException);
      expect(error?.getStatus()).toBe(401);
      expect(error?.code).toBe('UNAUTHENTICATED');
    }
  });

  it('turns SUSPENDED into 403 ACCOUNT_SUSPENDED', () => {
    const error = failure({ status: 'SUSPENDED' });
    expect(error?.getStatus()).toBe(403);
    expect(error?.code).toBe('ACCOUNT_SUSPENDED');
  });
});
