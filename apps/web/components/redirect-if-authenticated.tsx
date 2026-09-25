'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth';
import { eventNextPath } from '@/lib/next-path';

/**
 * 가입 · 로그인 화면: 이미 로그인 상태면(부팅 refresh 성공 · 로그인 성공) 내 프로필로 보낸다.
 * `?next=`가 일정 상세 주소(`/events/<UUID>`)면 그리로 보낸다(SPEC-003 D12). `useSearchParams`는 정적 렌더에서
 * Suspense 경계를 요구하므로, 이동할 때(effect 안) 주소를 직접 읽는다.
 */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'authenticated') {
      const next = eventNextPath(
        new URLSearchParams(window.location.search).get('next'),
      );
      router.replace(next ?? '/me');
    }
  }, [state, router]);

  return children;
}
