'use client';

import { Button } from '@oneul-sai/ui';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { FormAlert } from '@/components/form-alert';
import { LoadingBlock } from '@/components/loading-block';
import { useAuth } from '@/lib/auth';
import { SESSION_ENDED_MESSAGE } from '@/lib/errors';

/**
 * 보호 화면의 문지기(SPEC-001 4절 W3). 부팅 refresh가 끝날 때까지 로딩을 보여 주고,
 * 세션이 없으면 로그인 화면으로, 이 탭에서 로그아웃 · 탈퇴했으면 홈으로 보낸다.
 * 세션이 도중에 끝난 경우(401)는 이동하지 않고 다시 로그인하라는 안내를 보여 준다.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status !== 'anonymous') {
      return;
    }
    if (state.reason === 'no-session') {
      router.replace('/login');
    } else if (state.reason === 'signed-out') {
      router.replace('/');
    }
  }, [state, router]);

  if (state.status === 'authenticated') {
    return children;
  }

  if (state.status === 'anonymous' && state.reason === 'expired') {
    return (
      <div className="flex flex-col items-center gap-6">
        <FormAlert>{SESSION_ENDED_MESSAGE}</FormAlert>
        <Button onClick={() => router.replace('/login')}>로그인</Button>
      </div>
    );
  }

  return <LoadingBlock />;
}
