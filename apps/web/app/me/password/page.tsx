import type { Metadata } from 'next';

import { PageTitle } from '@/components/page-title';
import { PasswordForm } from '@/components/password-form';

export const metadata: Metadata = { title: '비밀번호 변경' };

// W5 비밀번호 변경(SPEC-001 4절).
export default function PasswordPage() {
  return (
    <>
      <PageTitle
        title="비밀번호 변경"
        description="바꾸면 다른 기기에서는 다시 로그인해야 합니다."
      />
      <PasswordForm />
    </>
  );
}
