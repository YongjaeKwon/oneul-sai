'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth';

/** 가입 · 로그인 화면: 이미 로그인 상태면(부팅 refresh 성공 · 로그인 성공) 내 프로필로 보낸다. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'authenticated') {
      router.replace('/me');
    }
  }, [state, router]);

  return children;
}
