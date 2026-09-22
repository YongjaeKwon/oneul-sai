import type { ReactNode } from 'react';

import { RequireAuth } from '@/components/require-auth';

/** 내 프로필 · 비밀번호 변경: 로그인한 회원만. 부팅 refresh가 끝날 때까지 로딩을 보여 준다(SPEC-001 4절 W3). */
export default function MeLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-6 py-12">
      <RequireAuth>{children}</RequireAuth>
    </main>
  );
}
