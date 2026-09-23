// 통합 테스트 도우미 (SPEC-002 13절: Nest 앱을 실제로 띄워 fetch로 호출, member-service TestApp과 같은 방식).
// PrismaService는 globalSetup이 inject한 테스트 DB URL로 만든다 — .env의 DATABASE_URL을 보지 않는다(D13).
// Gateway가 붙이는 헤더(x-internal-token · x-user-*)는 테스트가 직접 채운다. 빌드에서 제외된다.
import { env } from '../env.js';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import {
  HEADER_INTERNAL_TOKEN,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
  type AdminSchedule,
  type ApiErrorResponse,
  type CreateScheduleRequest,
  type Meetup,
  type MemberRole,
} from '@oneul-sai/contracts';
import { inject } from 'vitest';
import { createApp } from '../app.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resetTestDatabase } from './test-database.js';

export interface Caller {
  id: string;
  role: MemberRole;
}

export const ADMIN: Caller = { id: randomUUID(), role: 'ADMIN' };
export const MEMBER: Caller = { id: randomUUID(), role: 'MEMBER' };

export interface ApiCall {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  /** 본문을 문자열 그대로 보낸다(contentType과 함께). */
  rawBody?: string;
  contentType?: string;
  /** Gateway가 채우는 x-user-*. 없으면 붙이지 않는다. */
  user?: Caller;
  /** null이면 x-internal-token을 붙이지 않는다. */
  internalToken?: string | null;
}

export interface ApiResult {
  status: number;
  body: unknown;
  /** 응답 원문 — 비공개 값이 없는지 문자열로 찾는다. */
  text: string;
  headers: Headers;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** 오늘(UTC) 자정 + `days`일 + `hours`시(UTC, 기본 05:00 = 서울 14:00). 밀리초 없는 미래 시각. */
export function daysFromToday(days: number, hours = 5): Date {
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  return new Date(midnight.getTime() + days * DAY_MS + hours * 60 * MINUTE_MS);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

/** 규칙을 모두 통과하는 회차 생성 요청: `days`일 뒤 서울 14:00~16:00, 신청 마감 = 시작. */
export function scheduleInput(
  overrides: Partial<CreateScheduleRequest> = {},
  days = 7,
): CreateScheduleRequest {
  const startsAt = daysFromToday(days);
  return {
    startsAt: startsAt.toISOString(),
    endsAt: addMinutes(startsAt, 120).toISOString(),
    applyDeadlineAt: startsAt.toISOString(),
    priceMale: 39_000,
    priceFemale: 29_000,
    capacityMale: 7,
    capacityFemale: 7,
    venueArea: '성수',
    ...overrides,
  };
}

export const codeOf = (result: ApiResult): string | undefined =>
  (result.body as ApiErrorResponse | undefined)?.code;

export class TestApp {
  private constructor(
    readonly app: NestExpressApplication,
    readonly prisma: PrismaService,
    readonly baseUrl: string,
  ) {}

  static async start(): Promise<TestApp> {
    const prisma = new PrismaService(inject('testDatabaseUrl'));
    const app = await createApp({ logger: false, swagger: false, prisma });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    return new TestApp(app, prisma, `http://127.0.0.1:${address.port}`);
  }

  /** 각 테스트 앞에서 — 실제로 붙은 DB가 `_test_db`인지 확인한 뒤 비운다. */
  reset(): Promise<void> {
    return resetTestDatabase(this.prisma);
  }

  async close(): Promise<void> {
    await this.app.close();
    await this.prisma.$disconnect();
  }

  async call(input: ApiCall): Promise<ApiResult> {
    const headers: Record<string, string> = {
      [HEADER_REQUEST_ID]: `test-${randomUUID()}`,
    };
    if (input.internalToken !== null) {
      headers[HEADER_INTERNAL_TOKEN] =
        input.internalToken ?? env.INTERNAL_API_TOKEN;
    }
    if (input.user !== undefined) {
      headers[HEADER_USER_ID] = input.user.id;
      headers[HEADER_USER_ROLE] = input.user.role;
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
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text.length > 0 ? (JSON.parse(text) as unknown) : undefined,
      text,
      headers: response.headers,
    };
  }

  /** ADMIN 헤더로 부른다. */
  admin(
    method: ApiCall['method'],
    path: string,
    body?: unknown,
  ): Promise<ApiResult> {
    return this.call({ method, path, body, user: ADMIN });
  }

  async createMeetup(title = '오늘사이 로테이션 소개팅'): Promise<Meetup> {
    return expectStatus<Meetup>(
      await this.admin('POST', '/api/v1/meetups', { title }),
      201,
    );
  }

  async createSchedule(
    meetupId: string,
    input: CreateScheduleRequest = scheduleInput(),
  ): Promise<AdminSchedule> {
    return expectStatus<AdminSchedule>(
      await this.admin('POST', `/api/v1/meetups/${meetupId}/schedules`, input),
      201,
    );
  }

  async setStatus(
    schedule: Pick<AdminSchedule, 'id' | 'meetupId'>,
    status: 'OPEN' | 'CLOSED' | 'CANCELLED',
    cancelReason?: string,
  ): Promise<AdminSchedule> {
    return expectStatus<AdminSchedule>(
      await this.admin(
        'PATCH',
        `/api/v1/meetups/${schedule.meetupId}/schedules/${schedule.id}/status`,
        { status, cancelReason },
      ),
      200,
    );
  }

  /** 생성 → 공개. */
  async openSchedule(
    meetupId: string,
    input?: CreateScheduleRequest,
  ): Promise<AdminSchedule> {
    return this.setStatus(await this.createSchedule(meetupId, input), 'OPEN');
  }
}

function expectStatus<T>(result: ApiResult, status: number): T {
  if (result.status !== status) {
    throw new Error(`expected ${status}, got ${result.status} ${result.text}`);
  }
  return result.body as T;
}
