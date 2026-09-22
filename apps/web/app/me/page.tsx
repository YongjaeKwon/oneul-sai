import type { Metadata } from 'next';

import { PageTitle } from '@/components/page-title';
import { ProfileScreen } from '@/components/profile-screen';

export const metadata: Metadata = { title: '내 프로필' };

// W3 내 프로필 · W4 수정 · W6 탈퇴(SPEC-001 4절). 보호 데이터는 클라이언트 컴포넌트가 TanStack Query로 조회한다.
export default function MePage() {
  return (
    <>
      <PageTitle title="내 프로필" />
      <ProfileScreen />
    </>
  );
}
