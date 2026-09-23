import {
  API_ERROR_CODES,
  LoginRequestSchema,
  SignupRequestSchema,
} from '@oneul-sai/contracts';
import { ApiHttpException } from './api-error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  it('returns the normalized value on success', () => {
    const pipe = new ZodValidationPipe(LoginRequestSchema);
    expect(
      pipe.transform({
        email: ' Me@Example.com ',
        password: 'pw',
        client: 'WEB',
      }),
    ).toEqual({ email: 'me@example.com', password: 'pw', client: 'WEB' });
  });

  it('throws 400 VALIDATION_FAILED whose message names path and kind only, never the input', () => {
    const pipe = new ZodValidationPipe(LoginRequestSchema);
    let thrown: unknown;
    try {
      pipe.transform({ email: 'not-an-email', password: '', client: 'x' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiHttpException);
    const exception = thrown as ApiHttpException;
    expect(exception.getStatus()).toBe(400);
    expect(exception.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    const message = (exception.getResponse() as { message: string }).message;
    expect(message).toBe('email: 형식, password: 범위, client: 값');
    expect(message).not.toContain('not-an-email');
  });

  it('rejects unknown fields (strict) as "모르는 필드"', () => {
    const pipe = new ZodValidationPipe(SignupRequestSchema);
    expect(() =>
      pipe.transform({
        email: 'a@b.co',
        password: 'password1',
        name: '홍길동',
        gender: 'MALE',
        birthYear: 1990,
        phone: '01012345678',
        consents: { privacy: true, marketing: false },
        role: 'ADMIN',
      }),
    ).toThrow('body: 모르는 필드');
  });
});
