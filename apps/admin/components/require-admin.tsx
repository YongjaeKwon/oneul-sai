'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth-provider';
import { ScreenLoading } from './screen-loading';

const DEFAULT_PATH = '/members';

/**
 * 보호 화면 감싸개. 부팅 refresh가 끝날 때까지 로딩을 보여 주고, 로그아웃 상태면 `/login`으로 보낸다.
 * 목록이 아닌 곳(예: 회원 상세)에서 튕기면 로그인 뒤 그 화면으로 돌아오게 `next`를 붙인다.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== 'anonymous') {
      return;
    }
    const next =
      pathname !== DEFAULT_PATH ? `?next=${encodeURIComponent(pathname)}` : '';
    router.replace(`/login${next}`);
  }, [status, pathname, router]);

  if (status !== 'authenticated') {
    return <ScreenLoading />;
  }

  return <>{children}</>;
}
