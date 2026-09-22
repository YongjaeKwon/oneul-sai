// 통합 테스트 도우미 (SPEC-001 13절: Nest 앱을 실제로 띄워 supertest 없이 fetch로 호출).
// env.ts를 import하므로 .env(또는 CI env)의 인증 변수가 필요하다. 빌드에서 제외된다(tsconfig.build.json).
import { env } from '../env.js';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import {
  HEADER_INTERNAL_TOKEN,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_TYP,
  REFRESH_COOKIE_NAMES,
  type AuthResponse,
  type ClientType,
  type MemberProfile,
  type MemberRole,
  type SignupRequest,
} from '@oneul-sai/contracts';
import { jwtVerify, type JWTPayload } from 'jose';
import { createApp } from '../app.js';
import { LoginBackoffService } from '../auth/login-backoff.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { decodeAccessSecret } from '../tokens/token.service.js';

export interface ApiCall {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  /** 기본 application/json. 다른 content-type을 흉내 낼 때 지정한다. */
  contentType?: string;
  /** 본문을 문자열 그대로 보낸다 (contentType과 함께). */
  rawBody?: string;
  headers?: Record<string, string>;
  cookies?: Partial<Record<string, string>>;
  /** Gateway가 채우는 x-user-* */
  user?: { id: string; role: MemberRole };
  origin?: string;
  /** null이면 x-internal-token을 붙이지 않는다. */
  internalToken?: string | null;
}

export interface ParsedCookie {
  value: string;
  maxAge?: number;
  path?: string;
  sameSite?: string;
  httpOnly: boolean;
  secure: boolean;
}

export interface ApiResult {
  status: number;
  body: unknown;
  headers: Headers;
  cookies: Record<string, ParsedCookie>;
}

export const TEST_PASSWORD = 'correct-horse-battery';

export function parseSetCookie(header: string): [string, ParsedCookie] {
  const [pair = '', ...attributes] = header.split(';');
  const eq = pair.indexOf('=');
  const name = pair.slice(0, eq).trim();
  const cookie: ParsedCookie = {
    value: decodeURIComponent(pair.slice(eq + 1).trim()),
    httpOnly: false,
    secure: false,
  };
  for (const attribute of attributes) {
    const [key = '', value] = attribute.trim().split('=');
    switch (key.toLowerCase()) {
      case 'max-age':
        cookie.maxAge = Number(value);
        break;
      case 'path':
        cookie.path = value;
        break;
      case 'samesite':
        cookie.sameSite = value;
        break;
      case 'httponly':
        cookie.httpOnly = true;
        break;
      case 'secure':
        cookie.secure = true;
        break;
      default:
        break;
    }
  }
  return [name, cookie];
}

let emailSequence = 0;

export function signupInput(
  overrides: Partial<SignupRequest> = {},
): SignupRequest {
  emailSequence += 1;
  return {
    email: `member${emailSequence}@example.com`,
    password: TEST_PASSWORD,
    name: '홍길동',
    gender: 'MALE',
    birthYear: 1990,
    phone: '010-1234-5678',
    consents: { privacy: true, marketing: false },
    ...overrides,
  };
}

export class TestApp {
  private constructor(
    readonly app: NestExpressApplication,
    readonly baseUrl: string,
  ) {}

  static async start(): Promise<TestApp> {
    const app = await createApp({ logger: false, swagger: false });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    return new TestApp(app, `http://127.0.0.1:${address.port}`);
  }

  get prisma(): PrismaService {
    return this.app.get(PrismaService);
  }

  get backoff(): LoginBackoffService {
    return this.app.get(LoginBackoffService);
  }

  async close(): Promise<void> {
    await this.app.close();
  }

  async truncate(): Promise<void> {
    await this.prisma.refreshToken.deleteMany();
    await this.prisma.member.deleteMany();
  }

  async call(input: ApiCall): Promise<ApiResult> {
    const headers: Record<string, string> = {
      [HEADER_REQUEST_ID]: `test-${Date.now()}`,
      ...input.headers,
    };
    if (input.internalToken !== null) {
      headers[HEADER_INTERNAL_TOKEN] =
        input.internalToken ?? env.INTERNAL_API_TOKEN;
    }
    if (input.user) {
      headers[HEADER_USER_ID] = input.user.id;
      headers[HEADER_USER_ROLE] = input.user.role;
    }
    if (input.origin !== undefined) {
      headers.origin = input.origin;
    }
    const cookiePairs = Object.entries(input.cookies ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    );
    if (cookiePairs.length > 0) {
      headers.cookie = cookiePairs
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
        .join('; ');
    }

    let body: string | undefined;
    if (input.rawBody !== undefined) {
      body = input.rawBody;
      headers['content-type'] = input.contentType ?? 'text/plain';
    } else if (input.body !== undefined) {
      body = JSON.stringify(input.body);
      headers['content-type'] = input.contentType ?? 'application/json';
    }

    const response = await fetch(`${this.baseUrl}${input.path}`, {
      method: input.method,
      headers,
      body,
      redirect: 'manual',
    });
    const text = await response.text();
    const cookies: Record<string, ParsedCookie> = {};
    for (const header of response.headers.getSetCookie()) {
      const [name, cookie] = parseSetCookie(header);
      cookies[name] = cookie;
    }
    return {
      status: response.status,
      body: text.length > 0 ? (JSON.parse(text) as unknown) : undefined,
      headers: response.headers,
      cookies,
    };
  }

  async signup(overrides: Partial<SignupRequest> = {}): Promise<{
    result: ApiResult;
    profile: MemberProfile;
    input: SignupRequest;
  }> {
    const input = signupInput(overrides);
    const result = await this.call({
      method: 'POST',
      path: '/api/v1/members',
      body: input,
    });
    if (result.status !== 201) {
      throw new Error(
        `signup failed: ${result.status} ${JSON.stringify(result.body)}`,
      );
    }
    return { result, profile: result.body as MemberProfile, input };
  }

  login(
    email: string,
    password: string,
    client: ClientType,
    extra: Pick<ApiCall, 'cookies' | 'origin'> = {},
  ): Promise<ApiResult> {
    return this.call({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email, password, client },
      ...(client === 'ADMIN' && extra.origin === undefined
        ? { origin: env.ADMIN_ORIGIN }
        : {}),
      ...extra,
    });
  }

  refresh(
    client: ClientType,
    cookies: Partial<Record<string, string>>,
    extra: Pick<ApiCall, 'origin'> = {},
  ): Promise<ApiResult> {
    return this.call({
      method: 'POST',
      path: '/api/v1/auth/refresh',
      body: { client },
      cookies,
      ...(client === 'ADMIN' && extra.origin === undefined
        ? { origin: env.ADMIN_ORIGIN }
        : {}),
      ...extra,
    });
  }

  /** 로그인 · refresh 응답의 refresh 쿠키 값. */
  cookieOf(result: ApiResult, client: ClientType): string {
    const cookie = result.cookies[REFRESH_COOKIE_NAMES[client]];
    if (cookie === undefined) {
      throw new Error(`no ${REFRESH_COOKIE_NAMES[client]} cookie in response`);
    }
    return cookie.value;
  }

  authOf(result: ApiResult): AuthResponse {
    return result.body as AuthResponse;
  }

  /** Gateway와 같은 조건으로 access token을 검증하고 클레임을 돌려준다. */
  async verifyAccessToken(token: string): Promise<JWTPayload> {
    const { payload } = await jwtVerify(
      token,
      decodeAccessSecret(env.JWT_ACCESS_SECRET),
      {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        typ: JWT_TYP,
      },
    );
    return payload;
  }
}

export const cookieNames = REFRESH_COOKIE_NAMES;
