import type { Metadata } from 'next';

import { LoginForm } from '@/components/login-form';
import { PageTitle } from '@/components/page-title';
import { eventNextPath } from '@/lib/next-path';

export const metadata: Metadata = { title: '로그인' };

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// W2 로그인(SPEC-001 4절).
// `?next=`는 일정 상세 주소일 때만 이어 준다(SPEC-003 D12) — 로그인 뒤 이동은 `RedirectIfAuthenticated`가 한다.
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;

  return (
    <>
      <PageTitle
        title="로그인"
        description="가입한 이메일로 로그인해 주세요."
      />
      <LoginForm next={eventNextPath(typeof next === 'string' ? next : null)} />
    </>
  );
}
