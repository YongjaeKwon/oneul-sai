import { envSchema } from './env.schema.js';

// base64 디코드 32바이트 / 31바이트
const SECRET_32 = Buffer.alloc(32, 7).toString('base64');
const SECRET_31 = Buffer.alloc(31, 7).toString('base64');
const INTERNAL_TOKEN = 'x'.repeat(32);

const minimal = {
  JWT_ACCESS_SECRET: SECRET_32,
  INTERNAL_API_TOKEN: INTERNAL_TOKEN,
};

describe('envSchema', () => {
  it('applies SPEC-001 defaults with only the required variables', () => {
    const result = envSchema.safeParse(minimal);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4001,
      JWT_ACCESS_TTL: 900,
      REFRESH_TTL: 2_592_000,
      COOKIE_SECURE: true,
      ADMIN_ORIGIN: 'http://localhost:3001',
      SEED_ADMIN_RESET_PASSWORD: false,
    });
  });

  it('rejects JWT_ACCESS_SECRET whose base64 decodes to 31 bytes', () => {
    const result = envSchema.safeParse({
      ...minimal,
      JWT_ACCESS_SECRET: SECRET_31,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(['JWT_ACCESS_SECRET']);
  });

  it('rejects INTERNAL_API_TOKEN shorter than 32 characters', () => {
    const result = envSchema.safeParse({
      ...minimal,
      INTERNAL_API_TOKEN: 'x'.repeat(31),
    });

    expect(result.success).toBe(false);
  });

  it('refuses NODE_ENV=production with COOKIE_SECURE=false', () => {
    const result = envSchema.safeParse({
      ...minimal,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'false',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(['COOKIE_SECURE']);
  });

  it('allows COOKIE_SECURE=false outside production and parses it as boolean', () => {
    const result = envSchema.safeParse({
      ...minimal,
      NODE_ENV: 'development',
      COOKIE_SECURE: 'false',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.COOKIE_SECURE).toBe(false);
  });

  it('refuses NODE_ENV=production with a non-https ADMIN_ORIGIN (default included)', () => {
    const withDefault = envSchema.safeParse({
      ...minimal,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
    });
    expect(withDefault.success).toBe(false);
    if (!withDefault.success) {
      expect(withDefault.error.issues[0]?.path).toEqual(['ADMIN_ORIGIN']);
    }

    const withHttps = envSchema.safeParse({
      ...minimal,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      ADMIN_ORIGIN: 'https://admin.example.com',
    });
    expect(withHttps.success).toBe(true);
  });

  it('normalizes ADMIN_ORIGIN to an origin (no trailing slash or path)', () => {
    const result = envSchema.safeParse({
      ...minimal,
      ADMIN_ORIGIN: 'https://admin.example.com/login',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.ADMIN_ORIGIN).toBe('https://admin.example.com');
  });

  it('coerces numeric TTLs and rejects non-positive values', () => {
    const ok = envSchema.safeParse({
      ...minimal,
      JWT_ACCESS_TTL: '600',
      REFRESH_TTL: '86400',
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.JWT_ACCESS_TTL).toBe(600);
      expect(ok.data.REFRESH_TTL).toBe(86_400);
    }

    expect(
      envSchema.safeParse({ ...minimal, JWT_ACCESS_TTL: '0' }).success,
    ).toBe(false);
  });

  it('parses seed variables when present and leaves them optional otherwise', () => {
    const result = envSchema.safeParse({
      ...minimal,
      SEED_ADMIN_EMAIL: 'admin@example.com',
      SEED_ADMIN_NAME: '  운영자  ',
      SEED_ADMIN_RESET_PASSWORD: 'true',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.SEED_ADMIN_EMAIL).toBe('admin@example.com');
    expect(result.data.SEED_ADMIN_NAME).toBe('운영자');
    expect(result.data.SEED_ADMIN_RESET_PASSWORD).toBe(true);
    expect(result.data.SEED_ADMIN_PASSWORD_FILE).toBeUndefined();

    expect(
      envSchema.safeParse({ ...minimal, SEED_ADMIN_EMAIL: 'not-an-email' })
        .success,
    ).toBe(false);
  });
});
