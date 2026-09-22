import type { ReactNode } from 'react';

import { AdminHeader } from '@/components/admin-header';
import { RequireAdmin } from '@/components/require-admin';

/** 로그인한 운영자만 보는 화면들의 뼈대. 데이터는 각 화면이 클라이언트에서 TanStack Query로 가져온다. */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAdmin>
      <AdminHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
    </RequireAdmin>
  );
}
