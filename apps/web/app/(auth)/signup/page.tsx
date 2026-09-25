import type { Metadata } from 'next';

import { SignupForm } from '@/components/signup-form';
import { PageTitle } from '@/components/page-title';
import { eventNextPath } from '@/lib/next-path';

export const metadata: Metadata = { title: '가입하기' };

interface SignupPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// W1 가입(SPEC-001 4절). 페이지 뼈대만 서버 렌더하고 폼은 클라이언트 컴포넌트다.
// `?next=`는 일정 상세 주소일 때만 이어 준다(SPEC-003 D12) — 로그인 뒤 이동은 `RedirectIfAuthenticated`가 한다.
export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { next } = await searchParams;

  return (
    <>
      <PageTitle title="가입하기" description="오늘, 우리 사이의 시작." />
      <SignupForm
        next={eventNextPath(typeof next === 'string' ? next : null)}
      />
    </>
  );
}
