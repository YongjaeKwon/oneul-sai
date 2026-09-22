import type { Metadata } from 'next';

import { PageTitle } from '@/components/page-title';
import { SignupForm } from '@/components/signup-form';

export const metadata: Metadata = { title: '가입하기' };

// W1 가입(SPEC-001 4절). 페이지 뼈대만 서버 렌더하고 폼은 클라이언트 컴포넌트다.
export default function SignupPage() {
  return (
    <>
      <PageTitle title="가입하기" description="오늘, 우리 사이의 시작." />
      <SignupForm />
    </>
  );
}
