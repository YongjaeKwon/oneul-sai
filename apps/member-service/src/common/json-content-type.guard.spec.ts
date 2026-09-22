import { ApiHttpException } from './api-error.js';
import { fakeExecutionContext, fakeRequest } from '../testing/fakes.js';
import {
  isJsonContentType,
  JsonContentTypeGuard,
} from './json-content-type.guard.js';

describe('JsonContentTypeGuard', () => {
  const guard = new JsonContentTypeGuard();
  const contextWith = (contentType?: string) =>
    fakeExecutionContext({
      request: fakeRequest({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers:
          contentType === undefined ? {} : { 'content-type': contentType },
      }),
    });

  it('accepts application/json with or without parameters', () => {
    expect(guard.canActivate(contextWith('application/json'))).toBe(true);
    expect(
      guard.canActivate(contextWith('Application/JSON; charset=utf-8')),
    ).toBe(true);
    expect(isJsonContentType('application/json;charset=utf-8')).toBe(true);
  });

  it('rejects form, text and missing content types with 400 VALIDATION_FAILED (login CSRF)', () => {
    for (const contentType of [
      'application/x-www-form-urlencoded',
      'text/plain',
      undefined,
    ]) {
      let thrown: unknown;
      try {
        guard.canActivate(contextWith(contentType));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ApiHttpException);
      expect((thrown as ApiHttpException).getStatus()).toBe(400);
      expect((thrown as ApiHttpException).code).toBe('VALIDATION_FAILED');
      expect((thrown as ApiHttpException).message).toBe(
        'content-type: application/json',
      );
    }
  });
});
