import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LoginScreen } from '@/components/login-screen';
import { ScreenLoading } from '@/components/screen-loading';

export const metadata: Metadata = { title: '로그인' };

/** A1 로그인. `useSearchParams`(돌아갈 경로)를 쓰는 클라이언트 화면이라 Suspense로 감싼다. */
export default function LoginPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <LoginScreen />
    </Suspense>
  );
}
