import { HEADER_REQUEST_ID, SERVICE_NAMES } from '@oneul-sai/constants';
import {
  API_ERROR_CODES,
  HEADER_INTERNAL_TOKEN,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
  MemberProfileSchema,
  type Gender,
} from '@oneul-sai/contracts';
import { createLogger, type Logger } from '@oneul-sai/logger';
import { apiError, type CallerUser } from '@oneul-sai/service-kit';

// SPEC-003 D5 · ADR-011: 위임 호출. 신청 트랜잭션 전에 member-service에 호출자 **본인**의 프로필을 묻는다.
// 받은 x-user-id · x-user-role · x-request-id를 바꾸지 않고 싣고 내부 토큰을 붙인다. 경로는 여기 하나로 고정한다.
// 응답은 (HTTP 상태, code) 쌍으로 가르고, 표에 없는 모든 경우는 503이다(7절 "위임 호출 응답 해석").
// 로그에는 상태 · code · 에러 이름 · 걸린 시간 · requestId만 남긴다 — 응답 본문 · 헤더 값은 남기지 않는다(12절).

/** ADR-011 허용 목록: event-service → member-service `GET /api/v1/members/me` 하나. */
const MEMBER_ME_PATH = '/api/v1/members/me';
export const MEMBER_LOOKUP_TIMEOUT_MS = 3000;

/** 쓰는 필드만 남긴다 — 이메일 · 이름 · 휴대폰 · 출생연도는 여기서 떨어진다(연령 판정을 하지 않는다, SPEC-003 D15). */
const ApplicantProfileSchema = MemberProfileSchema.pick({
  status: true,
  role: true,
  gender: true,
});

/** 신청할 수 있는 회원: ACTIVE · MEMBER이고 성별이 있다(member_db CHECK). */
export interface Applicant {
  gender: Gender;
}

export interface MemberLookup {
  lookupSelf(caller: CallerUser, requestId: string): Promise<Applicant>;
}

export interface MemberClientOptions {
  /** env `MEMBER_SERVICE_URL` — member-service 포트(Gateway를 거치지 않는다). */
  baseUrl: string;
  internalToken: string;
  fetch?: typeof globalThis.fetch;
  logger?: Logger;
  now?: () => number;
}

const unauthenticated = () =>
  apiError(401, API_ERROR_CODES.UNAUTHENTICATED, '로그인이 필요합니다.');
const suspended = () =>
  apiError(
    403,
    API_ERROR_CODES.ACCOUNT_SUSPENDED,
    '이용이 정지된 계정입니다. 오늘사이에 문의해 주세요.',
  );
const busy = () =>
  apiError(
    503,
    API_ERROR_CODES.SERVICE_BUSY,
    '지금 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
  );

function codeOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const code = (body as Record<string, unknown>)['code'];
  return typeof code === 'string' && /^[A-Z_]+$/.test(code) ? code : undefined;
}

export class MemberClient implements MemberLookup {
  private readonly url: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly logger: Logger;
  private readonly now: () => number;

  constructor(private readonly options: MemberClientOptions) {
    this.url = `${options.baseUrl.replace(/\/+$/, '')}${MEMBER_ME_PATH}`;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.logger =
      options.logger ?? createLogger({ service: SERVICE_NAMES.eventService });
    this.now = options.now ?? Date.now;
  }

  async lookupSelf(caller: CallerUser, requestId: string): Promise<Applicant> {
    const startedAt = this.now();
    const fail = (
      level: 'warn' | 'error',
      fields: { status?: number; code?: string; errorName?: string },
    ) => {
      this.logger[level]('application.member_lookup_failed', {
        ...fields,
        durationMs: this.now() - startedAt,
        requestId,
      });
      return busy();
    };

    // 3초 안에 헤더와 본문을 모두 받아야 한다
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      MEMBER_LOOKUP_TIMEOUT_MS,
    );
    let status: number;
    let body: unknown;
    try {
      const response = await this.fetchImpl(this.url, {
        method: 'GET',
        headers: {
          [HEADER_USER_ID]: caller.id,
          [HEADER_USER_ROLE]: caller.role,
          [HEADER_REQUEST_ID]: requestId,
          [HEADER_INTERNAL_TOKEN]: this.options.internalToken,
        },
        signal: controller.signal,
        // 3xx를 따라가지 않는다 — 내부 토큰 · 호출자 헤더가 MEMBER_SERVICE_URL 밖으로 가지 않게.
        // 3xx는 표에 없는 응답이라 아래에서 503 + error(설정 오류)가 된다
        redirect: 'manual',
      });
      status = response.status;
      const text = await response.text();
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = undefined;
      }
    } catch (error) {
      throw fail('warn', {
        errorName: controller.signal.aborted
          ? 'TimeoutError'
          : error instanceof Error
            ? error.name
            : 'Error',
      });
    } finally {
      clearTimeout(timer);
    }

    if (status >= 500) throw fail('warn', { status, code: codeOf(body) });
    if (status !== 200) {
      const code = codeOf(body);
      if (status === 401 && code === API_ERROR_CODES.UNAUTHENTICATED) {
        throw unauthenticated();
      }
      if (status === 403 && code === API_ERROR_CODES.ACCOUNT_SUSPENDED) {
        throw suspended();
      }
      // 내부 토큰 불일치(401 INTERNAL_TOKEN_INVALID) · 403 FORBIDDEN · 404 · code 없음 — 설정 오류
      throw fail('error', { status, code });
    }

    const parsed = ApplicantProfileSchema.safeParse(body);
    if (!parsed.success) throw fail('error', { status, errorName: 'ZodError' });
    const profile = parsed.data;
    if (profile.status === 'SUSPENDED') throw suspended();
    if (
      profile.status !== 'ACTIVE' ||
      profile.role !== 'MEMBER' ||
      profile.gender === null
    ) {
      throw fail('error', { status, errorName: 'UnexpectedProfile' });
    }
    return { gender: profile.gender };
  }
}
