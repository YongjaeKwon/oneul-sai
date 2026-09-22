import { API_PREFIX } from '@oneul-sai/constants';

// SPEC-001 7절 엔드포인트 요약. 모두 Gateway(:4000) 경유.

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
