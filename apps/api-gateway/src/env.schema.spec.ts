import { envSchema } from './env.schema.js';

// 56바이트 → base64 (member-service .env.example의 개발용 값과 같다)
const DEV_SECRET =
  'b25ldWwtc2FpLWRldi1qd3QtYWNjZXNzLXNlY3JldC1kby1ub3QtdXNlLWluLXByb2R1Y3Rpb24=';
const INTERNAL_TOKEN =
  'oneul-sai-dev-internal-api-token-do-not-use-in-production';

const base = {
  JWT_ACCESS_SECRET: DEV_SECRET,
  INTERNAL_API_TOKEN: INTERNAL_TOKEN,
};

function issuesOf(source: Record<string, string>): string[] {
  const result = envSchema.safeParse(source);
  // 같은 변수에 refine이 여러 개 걸릴 수 있으므로 경로만 중복 없이 모은다
  return result.success
    ? []
    : [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
}

describe('envSchema', () => {
  it('필수 두 개만 주면 나머지는 기본값이다', () => {
    const parsed = envSchema.parse(base);

    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.PORT).toBe(4000);
    expect(parsed.CORS_ORIGINS).toEqual([
      'http://localhost:3000',
      'http://localhost:3001',
    ]);
    expect(parsed.RATE_LIMIT_AUTH_PER_MINUTE).toBe(10);
    expect(parsed.MEMBER_SERVICE_URL).toBe('http://localhost:4001');
  });

  it('CORS_ORIGINS는 쉼표로 나누고 공백을 없앤다', () => {
    const parsed = envSchema.parse({
      ...base,
      CORS_ORIGINS: ' https://onulsai.example , http://localhost:3000 ',
    });

    expect(parsed.CORS_ORIGINS).toEqual([
      'https://onulsai.example',
      'http://localhost:3000',
    ]);
  });

  it('JWT_ACCESS_SECRET 디코드 길이 31바이트 → 실패, 32바이트 → 통과', () => {
    const thirtyOne = Buffer.alloc(31, 1).toString('base64');
    const thirtyTwo = Buffer.alloc(32, 1).toString('base64');

    expect(issuesOf({ ...base, JWT_ACCESS_SECRET: thirtyOne })).toEqual([
      'JWT_ACCESS_SECRET',
    ]);
    expect(issuesOf({ ...base, JWT_ACCESS_SECRET: thirtyTwo })).toEqual([]);
  });

  it('길이만 긴 시크릿(aaaa...)은 디코드 길이가 모자라면 실패한다', () => {
    expect(issuesOf({ ...base, JWT_ACCESS_SECRET: 'a'.repeat(40) })).toEqual([
      'JWT_ACCESS_SECRET',
    ]);
  });

  it('JWT_ACCESS_SECRET · INTERNAL_API_TOKEN이 없으면 부팅하지 못한다', () => {
    expect(issuesOf({})).toEqual(
      expect.arrayContaining(['JWT_ACCESS_SECRET', 'INTERNAL_API_TOKEN']),
    );
    expect(issuesOf({ ...base, INTERNAL_API_TOKEN: 'short' })).toEqual([
      'INTERNAL_API_TOKEN',
    ]);
  });

  it('CORS_ORIGINS=* 는 환경과 무관하게 실패한다', () => {
    expect(issuesOf({ ...base, CORS_ORIGINS: '*' })).toEqual(['CORS_ORIGINS']);
    expect(
      issuesOf({ ...base, NODE_ENV: 'production', CORS_ORIGINS: '*' }),
    ).toEqual(['CORS_ORIGINS']);
  });

  it('프로덕션에서 localhost가 아닌 http:// origin은 실패한다', () => {
    expect(
      issuesOf({
        ...base,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://onulsai.example,http://insecure.example',
      }),
    ).toEqual(['CORS_ORIGINS']);
    expect(
      issuesOf({
        ...base,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://onulsai.example,http://localhost:3000',
      }),
    ).toEqual([]);
  });

  it('origin 형식이 아니면(경로 포함 · 스킴 없음) 실패한다', () => {
    expect(issuesOf({ ...base, CORS_ORIGINS: 'localhost:3000' })).toEqual([
      'CORS_ORIGINS',
    ]);
    expect(
      issuesOf({ ...base, CORS_ORIGINS: 'http://localhost:3000/app' }),
    ).toEqual(['CORS_ORIGINS']);
  });

  it('RATE_LIMIT_AUTH_PER_MINUTE는 양의 정수만 받는다', () => {
    expect(issuesOf({ ...base, RATE_LIMIT_AUTH_PER_MINUTE: '0' })).toEqual([
      'RATE_LIMIT_AUTH_PER_MINUTE',
    ]);
    expect(
      envSchema.parse({ ...base, RATE_LIMIT_AUTH_PER_MINUTE: '25' })
        .RATE_LIMIT_AUTH_PER_MINUTE,
    ).toBe(25);
  });
});
