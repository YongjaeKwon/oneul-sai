import type { ReactNode } from 'react';

import { RedirectIfAuthenticated } from '@/components/redirect-if-authenticated';

/** 가입 · 로그인: 좁은 한 열. 이미 로그인 상태면 내 프로필로 보낸다. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <RedirectIfAuthenticated>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-8 px-6 py-12">
        {children}
      </main>
    </RedirectIfAuthenticated>
  );
}
