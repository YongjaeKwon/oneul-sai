import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import {
  API_ERROR_CODES,
  type AdminApplication,
  type AdminApplicationListQuery,
  type AdminApplicationListResponse,
  type AdminSchedule,
  type AdminScheduleListQuery,
  type AdminScheduleListResponse,
  type AuthResponse,
  type BatchCreateSchedulesRequest,
  type BatchCreateSchedulesResponse,
  type ChangePasswordRequest,
  type ClientType,
  type CreateApplicationRequest,
  type CreateMeetupRequest,
  type CreateScheduleRequest,
  type LoginRequest,
  type LogoutRequest,
  type Meetup,
  type MeetupListQuery,
  type MeetupListResponse,
  type MemberDetail,
  type MemberListQuery,
  type MemberListResponse,
  type MemberProfile,
  type MyApplication,
  type MyApplicationListQuery,
  type MyApplicationListResponse,
  type PublicSchedule,
  type PublicScheduleListQuery,
  type PublicScheduleListResponse,
  type RefreshRequest,
  type SignupRequest,
  type UpdateApplicationStatusRequest,
  type UpdateMeetupRequest,
  type UpdateMemberStatusRequest,
  type UpdateMyProfileRequest,
  type UpdateScheduleRequest,
  type UpdateScheduleStatusRequest,
  type WithdrawRequest,
} from '@oneul-sai/contracts';
import { randomId } from '@oneul-sai/utils';

import {
  AccessTokenStore,
  type AccessTokenListener,
} from './access-token-store.js';
import { ApiClientError, isApiErrorResponse } from './error.js';
import {
  APPLICATION_PATHS,
  AUTH_PATHS,
  EVENT_PATHS,
  MEETUP_PATHS,
  MEMBER_PATHS,
} from './paths.js';

export interface ApiClientOptions {
  /** Gateway origin. 예: `http://localhost:4000` */
  baseUrl: string;
  /**
   * 이 인스턴스가 어느 앱인지(`WEB` | `ADMIN`). login · refresh · logout 본문의 `client`가 되고,
   * 서비스는 그 값이 가리키는 refresh 쿠키만 읽는다(SPEC-001 R1).
   * 없으면 login · refresh · logout과 만료 자동 재시도를 쓸 수 없다(공개 조회 전용).
   */
  client?: ClientType;
  /** web · admin은 `'include'` — refresh 쿠키(httpOnly)가 Gateway로 실리게 한다. */
  credentials?: RequestCredentials;
  /**
   * 401 `TOKEN_EXPIRED` 때 내장 refresh 대신 호출할 훅. 새 access token 또는 null(로그아웃 상태)을 돌려준다.
   * 같은 탭 안의 동시 만료는 하나의 호출로 합쳐진다(single-flight).
   */
  onTokenExpired?: () => Promise<string | null>;
  /** 테스트용 fetch 주입. 기본 `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestInit {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /**
   * `false`면 `Authorization`을 붙이지 않고 만료 재시도도 하지 않는다 — 공개 경로(가입 · 로그인 · refresh · 로그아웃 · 공개 일정 조회).
   * 만료 토큰이 공개 경로에서 401을 만들지 않게 한다(SPEC-001 7절). 기본 `true`.
   */
  auth?: boolean;
}

/** `login`에 넘기는 값. `client`는 생성자 옵션에서 채운다. */
export type LoginInput = Omit<LoginRequest, 'client'>;

/** `listMembers` 검색 조건. 생략한 값은 서버 기본값(page 1, pageSize 20). `ids`는 쉼표로 이어 보낸다(최대 `pageSize`개). */
export type MemberListParams = Partial<MemberListQuery>;

/** `listPublicEvents` 조건. 생략한 값은 서버 기본값(page 1, pageSize 20). */
export type PublicScheduleListParams = Partial<PublicScheduleListQuery>;

/** `listMeetups` 조건. 생략한 값은 서버 기본값(page 1, pageSize 20). */
export type MeetupListParams = Partial<MeetupListQuery>;

/** `listSchedules` 조건. `from` · `to`는 ISO 8601 + offset. 생략한 값은 서버 기본값(page 1, pageSize 20). */
export type AdminScheduleListParams = Partial<AdminScheduleListQuery>;

/** `listMyApplications` 조건. 생략한 값은 서버 기본값(page 1, pageSize 20). */
export type MyApplicationListParams = Partial<MyApplicationListQuery>;

/** `listScheduleApplications` 조건. 생략한 값은 서버 기본값(page 1, pageSize 100). */
export type AdminApplicationListParams = Partial<AdminApplicationListQuery>;

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Gateway(:4000)만 부르는 fetch 래퍼. 프레임워크에 묶이지 않는다.
 *
 * - access token은 인스턴스 메모리에만 둔다(`setAccessToken` · `getAccessToken` · `clearAccessToken` · `onAccessTokenChange`).
 * - 보호 경로가 401 `TOKEN_EXPIRED`를 받으면 `POST /api/v1/auth/refresh`를 한 번 호출해 원래 요청을 한 번 재시도한다.
 *   동시에 만료를 맞은 요청들은 하나의 refresh를 기다린다. refresh가 실패하면 토큰을 비우고 그 에러를 던진다.
 * - 앱은 부팅 때 `refresh()`를 한 번 호출해 토큰을 채운다. 401이면 로그아웃 상태다.
 */
export class ApiClient {
  private readonly tokens = new AccessTokenStore();
  private readonly fetchImpl: typeof globalThis.fetch;
  /** 진행 중인 `POST /auth/refresh`(부팅 · 만료 재시도 공용). 하나만 띄운다. */
  private refreshInFlight: Promise<AuthResponse> | null = null;
  /** 진행 중인 `onTokenExpired` 훅 호출. 하나만 띄운다. */
  private hookInFlight: Promise<string | null> | null = null;

  constructor(private readonly options: ApiClientOptions) {
    this.fetchImpl =
      options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  // ----- access token -----

  getAccessToken(): string | null {
    return this.tokens.get();
  }

  setAccessToken(token: string | null): void {
    this.tokens.set(token);
  }

  clearAccessToken(): void {
    this.tokens.clear();
  }

  /** 토큰이 바뀔 때(로그인 · refresh · 로그아웃 · 세션 만료) 알림. 해제 함수를 돌려준다. */
  onAccessTokenChange(listener: AccessTokenListener): () => void {
    return this.tokens.subscribe(listener);
  }

  // ----- generic -----

  async request<T>(
    method: HttpMethod,
    path: string,
    init: ApiRequestInit = {},
  ): Promise<T> {
    const auth = init.auth ?? true;
    const token = auth ? await this.currentToken() : null;
    const response = await this.send(method, path, init, token);

    if (auth && token !== null && response.status === 401) {
      const body = await parseResponseBody(response);
      const expired =
        isApiErrorResponse(body) && body.code === API_ERROR_CODES.TOKEN_EXPIRED;
      if (expired && this.canRenew()) {
        const renewed = await this.renewAccessToken(token);
        if (renewed !== null) {
          return this.finish<T>(await this.send(method, path, init, renewed));
        }
      }
      throw new ApiClientError(response.status, body);
    }

    return this.finish<T>(response);
  }

  get<T>(path: string, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('GET', path, init);
  }

  post<T>(path: string, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('POST', path, init);
  }

  put<T>(path: string, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('PUT', path, init);
  }

  patch<T>(path: string, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('PATCH', path, init);
  }

  delete<T>(path: string, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('DELETE', path, init);
  }

  // ----- auth (SPEC-001) -----

  /** `POST /api/v1/members` (공개). 201이면 이어서 `login`을 호출해 로그인 상태로 만든다(W1). */
  signup(input: SignupRequest): Promise<MemberProfile> {
    return this.request<MemberProfile>('POST', MEMBER_PATHS.members, {
      body: input,
      auth: false,
    });
  }

  /** `POST /api/v1/auth/login` (공개). 성공하면 access token을 메모리에 넣는다. refresh 쿠키는 브라우저가 받는다. */
  async login(input: LoginInput): Promise<AuthResponse> {
    const body: LoginRequest = { ...input, client: this.requireClient() };
    const auth = await this.request<AuthResponse>('POST', AUTH_PATHS.login, {
      body,
      auth: false,
    });
    this.tokens.set(auth.accessToken);
    return auth;
  }

  /**
   * `POST /api/v1/auth/refresh` (공개, 쿠키). 부팅 때 한 번, 그리고 만료 재시도에서 쓴다.
   * 이미 진행 중이면 새로 부르지 않고 그 결과를 함께 기다린다(single-flight).
   * 400 · 401 · 403이면 세션이 없는 것이므로 토큰을 비운다(429 · 5xx · 네트워크 오류는 그대로 둔다).
   */
  refresh(): Promise<AuthResponse> {
    if (this.refreshInFlight === null) {
      this.refreshInFlight = this.doRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<AuthResponse> {
    const body: RefreshRequest = { client: this.requireClient() };
    try {
      const auth = await this.request<AuthResponse>(
        'POST',
        AUTH_PATHS.refresh,
        {
          body,
          auth: false,
        },
      );
      this.tokens.set(auth.accessToken);
      return auth;
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        (error.status === 400 || error.status === 401 || error.status === 403)
      ) {
        this.tokens.clear();
      }
      throw error;
    }
  }

  /** `POST /api/v1/auth/logout` (공개, 쿠키). 요청 결과와 무관하게 메모리의 토큰은 지운다. */
  async logout(): Promise<void> {
    const body: LogoutRequest = { client: this.requireClient() };
    try {
      await this.request<void>('POST', AUTH_PATHS.logout, {
        body,
        auth: false,
      });
    } finally {
      this.tokens.clear();
    }
  }

  /** `POST /api/v1/auth/logout-all` (회원). 성공하면 토큰을 지운다(실패하면 다시 시도할 수 있게 남긴다). */
  async logoutAll(): Promise<void> {
    await this.request<void>('POST', AUTH_PATHS.logoutAll);
    this.tokens.clear();
  }

  /** `POST /api/v1/auth/password` (회원). 현재 탭의 세션은 유지된다. */
  changePassword(input: ChangePasswordRequest): Promise<void> {
    return this.request<void>('POST', AUTH_PATHS.password, { body: input });
  }

  // ----- members (본인) -----

  /** `GET /api/v1/members/me` */
  getMe(): Promise<MemberProfile> {
    return this.request<MemberProfile>('GET', MEMBER_PATHS.me);
  }

  /** `PATCH /api/v1/members/me`. `phone`을 바꾸면 `currentPassword`가 필요하다(D9). */
  updateMe(input: UpdateMyProfileRequest): Promise<MemberProfile> {
    return this.request<MemberProfile>('PATCH', MEMBER_PATHS.me, {
      body: input,
    });
  }

  /** `DELETE /api/v1/members/me` (본문 `{ password }`). 성공하면 토큰을 지운다. */
  async withdraw(input: WithdrawRequest): Promise<void> {
    await this.request<void>('DELETE', MEMBER_PATHS.me, { body: input });
    this.tokens.clear();
  }

  // ----- members (운영자) -----

  /** `GET /api/v1/members?query=&status=&role=&ids=&page=&pageSize=` (ADMIN) */
  listMembers(params: MemberListParams = {}): Promise<MemberListResponse> {
    const { ids, ...rest } = params;
    return this.request<MemberListResponse>('GET', MEMBER_PATHS.members, {
      query: { ...rest, ids: ids?.join(',') },
    });
  }

  /** `GET /api/v1/members/:id` (ADMIN) */
  getMember(id: string): Promise<MemberDetail> {
    return this.request<MemberDetail>('GET', MEMBER_PATHS.member(id));
  }

  /** `PATCH /api/v1/members/:id/status` (ADMIN) */
  updateMemberStatus(
    id: string,
    input: UpdateMemberStatusRequest,
  ): Promise<MemberDetail> {
    return this.request<MemberDetail>('PATCH', MEMBER_PATHS.memberStatus(id), {
      body: input,
    });
  }

  // ----- 일정 (공개, SPEC-002) — 만료 토큰이 공개 조회를 401로 만들지 않게 `auth: false` -----

  /** `GET /api/v1/events?page=&pageSize=` (공개) */
  listPublicEvents(
    params: PublicScheduleListParams = {},
  ): Promise<PublicScheduleListResponse> {
    return this.request<PublicScheduleListResponse>('GET', EVENT_PATHS.events, {
      query: params,
      auth: false,
    });
  }

  /** `GET /api/v1/events/:id` (공개). DRAFT · CANCELLED · 없음은 모두 404 `SCHEDULE_NOT_FOUND`. */
  getPublicEvent(id: string): Promise<PublicSchedule> {
    return this.request<PublicSchedule>('GET', EVENT_PATHS.event(id), {
      auth: false,
    });
  }

  // ----- 모임 상품 · 회차 (운영자, SPEC-002) -----

  /** `GET /api/v1/meetups?page=&pageSize=` (ADMIN) */
  listMeetups(params: MeetupListParams = {}): Promise<MeetupListResponse> {
    return this.request<MeetupListResponse>('GET', MEETUP_PATHS.meetups, {
      query: params,
    });
  }

  /** `POST /api/v1/meetups` (ADMIN) */
  createMeetup(input: CreateMeetupRequest): Promise<Meetup> {
    return this.request<Meetup>('POST', MEETUP_PATHS.meetups, { body: input });
  }

  /** `GET /api/v1/meetups/:meetupId` (ADMIN) */
  getMeetup(meetupId: string): Promise<Meetup> {
    return this.request<Meetup>('GET', MEETUP_PATHS.meetup(meetupId));
  }

  /** `PATCH /api/v1/meetups/:meetupId` (ADMIN). 바꾼 필드만 보낸다. */
  updateMeetup(meetupId: string, input: UpdateMeetupRequest): Promise<Meetup> {
    return this.request<Meetup>('PATCH', MEETUP_PATHS.meetup(meetupId), {
      body: input,
    });
  }

  /** `GET /api/v1/meetups/:meetupId/schedules?status=&from=&to=&page=&pageSize=` (ADMIN) */
  listSchedules(
    meetupId: string,
    params: AdminScheduleListParams = {},
  ): Promise<AdminScheduleListResponse> {
    return this.request<AdminScheduleListResponse>(
      'GET',
      MEETUP_PATHS.schedules(meetupId),
      { query: params },
    );
  }

  /** `POST /api/v1/meetups/:meetupId/schedules` (ADMIN). 201 DRAFT. */
  createSchedule(
    meetupId: string,
    input: CreateScheduleRequest,
  ): Promise<AdminSchedule> {
    return this.request<AdminSchedule>(
      'POST',
      MEETUP_PATHS.schedules(meetupId),
      { body: input },
    );
  }

  /** `POST /api/v1/meetups/:meetupId/schedules/batch` (ADMIN, D15). 전부 또는 없음, 응답은 요청 순서 · 전부 DRAFT. */
  createSchedulesBatch(
    meetupId: string,
    input: BatchCreateSchedulesRequest,
  ): Promise<BatchCreateSchedulesResponse> {
    return this.request<BatchCreateSchedulesResponse>(
      'POST',
      MEETUP_PATHS.scheduleBatch(meetupId),
      { body: input },
    );
  }

  /** `GET /api/v1/meetups/:meetupId/schedules/:scheduleId` (ADMIN) */
  getSchedule(meetupId: string, scheduleId: string): Promise<AdminSchedule> {
    return this.request<AdminSchedule>(
      'GET',
      MEETUP_PATHS.schedule(meetupId, scheduleId),
    );
  }

  /** `PATCH /api/v1/meetups/:meetupId/schedules/:scheduleId` (ADMIN). 바꾼 필드만, 선택 필드는 `null`로 비운다. */
  updateSchedule(
    meetupId: string,
    scheduleId: string,
    input: UpdateScheduleRequest,
  ): Promise<AdminSchedule> {
    return this.request<AdminSchedule>(
      'PATCH',
      MEETUP_PATHS.schedule(meetupId, scheduleId),
      { body: input },
    );
  }

  /** `PATCH /api/v1/meetups/:meetupId/schedules/:scheduleId/status` (ADMIN). 같은 상태는 200 no-op. */
  updateScheduleStatus(
    meetupId: string,
    scheduleId: string,
    input: UpdateScheduleStatusRequest,
  ): Promise<AdminSchedule> {
    return this.request<AdminSchedule>(
      'PATCH',
      MEETUP_PATHS.scheduleStatus(meetupId, scheduleId),
      { body: input },
    );
  }

  /** `DELETE /api/v1/meetups/:meetupId/schedules/:scheduleId` (ADMIN). DRAFT만, 204. */
  deleteSchedule(meetupId: string, scheduleId: string): Promise<void> {
    return this.request<void>(
      'DELETE',
      MEETUP_PATHS.schedule(meetupId, scheduleId),
    );
  }

  // ----- 참가 신청 (회원, SPEC-003) -----

  /** `POST /api/v1/applications` (MEMBER). 201 입금 대기. */
  apply(scheduleId: string): Promise<MyApplication> {
    return this.request<MyApplication>('POST', APPLICATION_PATHS.applications, {
      body: { scheduleId } satisfies CreateApplicationRequest,
    });
  }

  /** `GET /api/v1/applications?scheduleId=&page=&pageSize=` (MEMBER). 모든 상태, 최근 신청부터. */
  listMyApplications(
    params: MyApplicationListParams = {},
  ): Promise<MyApplicationListResponse> {
    return this.request<MyApplicationListResponse>(
      'GET',
      APPLICATION_PATHS.applications,
      { query: params },
    );
  }

  /** `PATCH /api/v1/applications/:applicationId/status` (MEMBER). 신청 마감 전까지 본인 취소. */
  cancelMyApplication(applicationId: string): Promise<MyApplication> {
    return this.request<MyApplication>(
      'PATCH',
      APPLICATION_PATHS.applicationStatus(applicationId),
      {
        body: { status: 'CANCELLED' } satisfies UpdateApplicationStatusRequest,
      },
    );
  }

  // ----- 참가 신청 (운영자, SPEC-003) -----

  /** `GET /api/v1/meetups/:meetupId/schedules/:scheduleId/applications?status=&page=&pageSize=` (ADMIN). 신청 순. */
  listScheduleApplications(
    meetupId: string,
    scheduleId: string,
    params: AdminApplicationListParams = {},
  ): Promise<AdminApplicationListResponse> {
    return this.request<AdminApplicationListResponse>(
      'GET',
      MEETUP_PATHS.applications(meetupId, scheduleId),
      { query: params },
    );
  }

  /** `PATCH .../schedules/:scheduleId/applications/:applicationId/status` (ADMIN). 언제든 취소, 사유 없음. */
  cancelApplication(
    meetupId: string,
    scheduleId: string,
    applicationId: string,
  ): Promise<AdminApplication> {
    return this.request<AdminApplication>(
      'PATCH',
      MEETUP_PATHS.applicationStatus(meetupId, scheduleId, applicationId),
      {
        body: { status: 'CANCELLED' } satisfies UpdateApplicationStatusRequest,
      },
    );
  }

  // ----- internals -----

  private requireClient(): ClientType {
    if (this.options.client === undefined) {
      throw new Error(
        'ApiClient: `client` option (WEB | ADMIN) is required for auth requests',
      );
    }
    return this.options.client;
  }

  private canRenew(): boolean {
    return (
      this.options.onTokenExpired !== undefined ||
      this.options.client !== undefined
    );
  }

  /** 메모리의 토큰. 토큰이 없는데 refresh(부팅) 또는 훅이 진행 중이면 그 결과를 기다린다(먼저 출발한 보호 요청이 헛되이 401을 받지 않게). */
  private async currentToken(): Promise<string | null> {
    const token = this.tokens.get();
    if (token !== null) {
      return token;
    }
    try {
      if (this.refreshInFlight !== null) {
        return (await this.refreshInFlight).accessToken;
      }
      if (this.hookInFlight !== null) {
        return await this.hookInFlight;
      }
    } catch {
      // 실패한 갱신은 그쪽 호출자가 처리한다. 이 요청은 토큰 없이 나가 서비스의 401을 받는다.
    }
    return null;
  }

  /**
   * 만료된 토큰을 새 토큰으로 바꾼다. 다른 호출이 이미 바꿨으면 그 값을 쓰고, 아니면 하나의 refresh(또는 훅)를 공유한다.
   * 갱신이 실패하면 기다리던 모든 호출에 같은 에러가 간다.
   */
  private async renewAccessToken(expiredToken: string): Promise<string | null> {
    const current = this.tokens.get();
    if (current !== null && current !== expiredToken) {
      return current;
    }
    const hook = this.options.onTokenExpired;
    if (hook === undefined) {
      return (await this.refresh()).accessToken;
    }
    if (this.hookInFlight === null) {
      this.hookInFlight = hook()
        .then((token) => {
          this.tokens.set(token);
          return token;
        })
        .finally(() => {
          this.hookInFlight = null;
        });
    }
    return this.hookInFlight;
  }

  private async send(
    method: HttpMethod,
    path: string,
    init: ApiRequestInit,
    token: string | null,
  ): Promise<Response> {
    const headers = new Headers();
    headers.set(HEADER_REQUEST_ID, randomId());
    if (token !== null) {
      headers.set('authorization', `Bearer ${token}`);
    }

    let body: string | undefined;
    if (init.body !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(init.body);
    }

    return this.fetchImpl(this.buildUrl(path, init.query), {
      method,
      headers,
      body,
      credentials: this.options.credentials,
    });
  }

  private async finish<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new ApiClientError(
        response.status,
        await parseResponseBody(response),
      );
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await parseResponseBody(response)) as T;
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): string {
    const base = this.options.baseUrl.replace(/\/+$/, '');
    let url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString.length > 0) {
        url += `?${queryString}`;
      }
    }
    return url;
  }
}
