import { envSchema } from './env.schema.js';

// SPEC-003 13절 단위: MEMBER_SERVICE_URL은 production에서 필수, development · test는 기본값.

const minimal = { INTERNAL_API_TOKEN: 'x'.repeat(32) };

describe('envSchema', () => {
  it.each(['development', 'test'] as const)(
    '%s: MEMBER_SERVICE_URL defaults to the local member-service',
    (NODE_ENV) => {
      const result = envSchema.safeParse({ ...minimal, NODE_ENV });
      expect(result.success).toBe(true);
      expect(result.data?.MEMBER_SERVICE_URL).toBe('http://localhost:4001');
    },
  );

  it('production: fails without MEMBER_SERVICE_URL', () => {
    const result = envSchema.safeParse({ ...minimal, NODE_ENV: 'production' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['MEMBER_SERVICE_URL']);
  });

  it('production: takes the given MEMBER_SERVICE_URL', () => {
    const result = envSchema.safeParse({
      ...minimal,
      NODE_ENV: 'production',
      MEMBER_SERVICE_URL: 'http://member-service:4001',
    });
    expect(result.data?.MEMBER_SERVICE_URL).toBe('http://member-service:4001');
  });

  it('rejects a MEMBER_SERVICE_URL that is not a URL', () => {
    const result = envSchema.safeParse({
      ...minimal,
      MEMBER_SERVICE_URL: 'member-service',
    });
    expect(result.success).toBe(false);
  });
});
