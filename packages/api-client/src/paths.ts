import { API_PREFIX } from '@oneul-sai/constants';

// SPEC-001 · SPEC-002 7절 엔드포인트 요약. 모두 Gateway(:4000) 경유. 경로의 ID는 `encodeURIComponent`.

export const AUTH_PATHS = {
  login: `${API_PREFIX}/auth/login`,
  refresh: `${API_PREFIX}/auth/refresh`,
  logout: `${API_PREFIX}/auth/logout`,
  logoutAll: `${API_PREFIX}/auth/logout-all`,
  password: `${API_PREFIX}/auth/password`,
} as const;

export const MEMBER_PATHS = {
  members: `${API_PREFIX}/members`,
  me: `${API_PREFIX}/members/me`,
  member: (id: string): string =>
    `${API_PREFIX}/members/${encodeURIComponent(id)}`,
  memberStatus: (id: string): string =>
    `${API_PREFIX}/members/${encodeURIComponent(id)}/status`,
} as const;

/** 참가자 공개 경로(SPEC-002 D9). "events"는 참가자에게 보이는 회차(일정)다. */
export const EVENT_PATHS = {
  events: `${API_PREFIX}/events`,
  event: (id: string): string =>
    `${API_PREFIX}/events/${encodeURIComponent(id)}`,
} as const;

/** 운영자 경로(SPEC-002 D9) — `/api/v1/meetups/**`는 전부 ADMIN. */
export const MEETUP_PATHS = {
  meetups: `${API_PREFIX}/meetups`,
  meetup: (meetupId: string): string =>
    `${API_PREFIX}/meetups/${encodeURIComponent(meetupId)}`,
  schedules: (meetupId: string): string =>
    `${API_PREFIX}/meetups/${encodeURIComponent(meetupId)}/schedules`,
  scheduleBatch: (meetupId: string): string =>
    `${API_PREFIX}/meetups/${encodeURIComponent(meetupId)}/schedules/batch`,
  schedule: (meetupId: string, scheduleId: string): string =>
    `${API_PREFIX}/meetups/${encodeURIComponent(meetupId)}/schedules/${encodeURIComponent(scheduleId)}`,
  scheduleStatus: (meetupId: string, scheduleId: string): string =>
    `${API_PREFIX}/meetups/${encodeURIComponent(meetupId)}/schedules/${encodeURIComponent(scheduleId)}/status`,
} as const;
