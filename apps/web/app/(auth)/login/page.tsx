import type { Metadata } from 'next';

import { LoginForm } from '@/components/login-form';
import { PageTitle } from '@/components/page-title';

export const metadata: Metadata = { title: '로그인' };

// W2 로그인(SPEC-001 4절).
export default function LoginPage() {
  return (
    <>
      <PageTitle
        title="로그인"
        description="가입한 이메일로 로그인해 주세요."
      />
      <LoginForm />
    </>
  );
}
