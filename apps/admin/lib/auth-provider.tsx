'use client';

import type { LoginInput } from '@oneul-sai/api-client';
import type { MemberProfile } from '@oneul-sai/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { apiClient } from './api';
import { isApiClientError } from './errors';

/** `loading`: 부팅 refresh가 끝나기 전(깜빡임 없이 판정한 뒤 렌더, SPEC-001 4절 W3). */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  me: MemberProfile | null;
}

export interface AuthContextValue extends AuthState {
  /** A1 로그인. 역할이 ADMIN이 아니면 세션을 남기지 않고 `NotAdminError`를 던진다. */
  login: (input: LoginInput) => Promise<MemberProfile>;
  /** `POST /auth/logout`(본문 `{ client: 'ADMIN' }`) 뒤 메모리의 토큰 · 캐시를 비운다. */
  logout: () => Promise<void>;
  /** 보호 요청이 401을 받았을 때 — 어떤 401이든 클라이언트는 로그아웃 상태로 본다(7절). */
  endSession: () => void;
}

const LOADING: AuthState = { status: 'loading', me: null };
const ANONYMOUS: AuthState = { status: 'anonymous', me: null };

const AuthContext = createContext<AuthContextValue | null>(null);

/** 로그인 응답의 역할이 ADMIN이 아닐 때. 서비스가 403 `ROLE_NOT_ALLOWED`로 먼저 막지만 화면도 같은 문구를 쓴다(7절). */
export class NotAdminError extends Error {
  constructor() {
    super('운영자 계정이 아닙니다.');
    this.name = 'NotAdminError';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(LOADING);

  useEffect(() => {
    let cancelled = false;

    // 부팅 refresh(4절 A1 · W9): 쿠키로 access token을 한 번 복구한다. 400 · 401 · 403이면 로그아웃 상태다.
    apiClient
      .refresh()
      .then((auth) => {
        if (cancelled) {
          return;
        }
        if (auth.member.role !== 'ADMIN') {
          apiClient.clearAccessToken();
          setState(ANONYMOUS);
          return;
        }
        setState({ status: 'authenticated', me: auth.member });
      })
      .catch(() => {
        if (!cancelled) {
          setState(ANONYMOUS);
        }
      });

    // 만료 재시도의 refresh가 실패하면 api-client가 토큰을 비운다 → 로그아웃 상태로 본다.
    const unsubscribe = apiClient.onAccessTokenChange((token) => {
      if (token === null) {
        queryClient.clear();
        setState(ANONYMOUS);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [queryClient]);

  const login = useCallback(async (input: LoginInput) => {
    const auth = await apiClient.login(input);
    if (auth.member.role !== 'ADMIN') {
      await apiClient.logout().catch(() => undefined);
      throw new NotAdminError();
    }
    setState({ status: 'authenticated', me: auth.member });
    return auth.member;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } finally {
      queryClient.clear();
      setState(ANONYMOUS);
    }
  }, [queryClient]);

  const endSession = useCallback(() => {
    apiClient.clearAccessToken();
    queryClient.clear();
    setState(ANONYMOUS);
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, endSession }),
    [state, login, logout, endSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있습니다.');
  }
  return value;
}

/** 보호 조회의 에러가 401이면 세션을 끝낸다(탈퇴 계정 · 만료 뒤 refresh 실패 등). */
export function useEndSessionOn401(error: unknown): void {
  const { endSession } = useAuth();

  useEffect(() => {
    if (isApiClientError(error) && error.status === 401) {
      endSession();
    }
  }, [error, endSession]);
}
