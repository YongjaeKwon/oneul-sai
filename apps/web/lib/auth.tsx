'use client';

import type { LoginInput } from '@oneul-sai/api-client';
import type { MemberProfile, WithdrawRequest } from '@oneul-sai/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { apiClient } from './api';
import { isSessionEnded } from './errors';
import { meKey } from './query-keys';

/**
 * 로그아웃 상태가 된 이유. 보호 화면(`RequireAuth`)이 이 값으로 갈 곳을 정한다.
 * - `no-session`: 부팅 refresh에 세션이 없었다 → 로그인 화면으로.
 * - `signed-out`: 이 탭에서 로그아웃 · 모든 기기 로그아웃 · 탈퇴했다 → 홈으로.
 * - `expired`: 세션이 도중에 끝났다(401, refresh 실패) → "다시 로그인해 주세요".
 */
export type AnonymousReason = 'no-session' | 'signed-out' | 'expired';

/** `loading`: 부팅 refresh가 끝나기 전(깜빡임 없이 판정한 뒤 렌더, SPEC-001 4절 W3). */
export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated' }
  | { status: 'anonymous'; reason: AnonymousReason };

export interface AuthContextValue {
  state: AuthState;
  /** W2 로그인. 성공하면 `me` 캐시를 채우고 로그인 상태가 된다. */
  login: (input: LoginInput) => Promise<MemberProfile>;
  /** `POST /auth/logout`(본문 `{ client: 'WEB' }`). 요청 결과와 무관하게 이 탭은 로그아웃 상태가 된다. */
  logout: () => Promise<void>;
  /** `POST /auth/logout-all`. 이 회원의 모든 세션을 끊는다(D8). 실패하면 던진다. */
  logoutAll: () => Promise<void>;
  /** `DELETE /members/me`. 비밀번호가 틀리면 401 `INVALID_CREDENTIALS`를 던진다. */
  withdraw: (input: WithdrawRequest) => Promise<void>;
  /** 보호 요청이 401을 받았을 때 — 어떤 401이든 클라이언트는 로그아웃 상태로 본다(7절). */
  endSession: () => void;
}

const LOADING: AuthState = { status: 'loading' };
const AUTHENTICATED: AuthState = { status: 'authenticated' };
const NO_SESSION: AuthState = { status: 'anonymous', reason: 'no-session' };
const SIGNED_OUT: AuthState = { status: 'anonymous', reason: 'signed-out' };
const EXPIRED: AuthState = { status: 'anonymous', reason: 'expired' };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(LOADING);
  /** 이 탭이 스스로 세션을 끝내는 동안 true — 그때 토큰이 비는 것은 '만료'가 아니다. */
  const leaving = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // 부팅 refresh(4절 9번): 쿠키로 access token을 한 번 복구한다. 400 · 401 · 403이면 세션이 없다.
    apiClient
      .refresh()
      .then((auth) => {
        if (cancelled) {
          return;
        }
        queryClient.setQueryData(meKey, auth.member);
        setState(AUTHENTICATED);
      })
      .catch(() => {
        if (!cancelled) {
          setState(NO_SESSION);
        }
      });

    // 만료 재시도의 refresh가 실패하면 api-client가 토큰을 비운다 → 세션이 끝난 것이다.
    const unsubscribe = apiClient.onAccessTokenChange((token) => {
      if (token === null && !leaving.current) {
        queryClient.clear();
        setState(EXPIRED);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [queryClient]);

  const login = useCallback(
    async (input: LoginInput) => {
      const auth = await apiClient.login(input);
      queryClient.setQueryData(meKey, auth.member);
      setState(AUTHENTICATED);
      return auth.member;
    },
    [queryClient],
  );

  /** 로그아웃 계열 공통: 성공하면 `signed-out`, 도중에 세션이 끝났으면 `expired`, 그 밖의 실패는 상태를 두고 던진다. */
  const signOut = useCallback(
    async (run: () => Promise<void>) => {
      leaving.current = true;
      try {
        await run();
      } catch (error) {
        if (isSessionEnded(error) || apiClient.getAccessToken() === null) {
          apiClient.clearAccessToken();
          queryClient.clear();
          setState(EXPIRED);
        }
        throw error;
      } finally {
        leaving.current = false;
      }
      queryClient.clear();
      setState(SIGNED_OUT);
    },
    [queryClient],
  );

  const logout = useCallback(
    () =>
      signOut(() =>
        // 요청이 실패해도 이 탭의 토큰은 비워진다(api-client). 홈으로 간다.
        apiClient.logout().catch(() => undefined),
      ),
    [signOut],
  );

  const logoutAll = useCallback(
    () => signOut(() => apiClient.logoutAll()),
    [signOut],
  );

  const withdraw = useCallback(
    (input: WithdrawRequest) => signOut(() => apiClient.withdraw(input)),
    [signOut],
  );

  const endSession = useCallback(() => {
    leaving.current = true;
    try {
      apiClient.clearAccessToken();
    } finally {
      leaving.current = false;
    }
    queryClient.clear();
    setState(EXPIRED);
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, logout, logoutAll, withdraw, endSession }),
    [state, login, logout, logoutAll, withdraw, endSession],
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

/** 보호 조회의 에러가 세션 종료(401)면 로그아웃 상태로 만든다(탈퇴 계정 · 만료 뒤 refresh 실패 등). */
export function useEndSessionOn401(error: unknown): void {
  const { endSession } = useAuth();

  useEffect(() => {
    if (isSessionEnded(error)) {
      endSession();
    }
  }, [error, endSession]);
}
