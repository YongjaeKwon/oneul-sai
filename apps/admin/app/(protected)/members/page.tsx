import type { Metadata } from 'next';
import { Suspense } from 'react';

import { MemberListScreen } from '@/components/member-list-screen';
import { ScreenLoading } from '@/components/screen-loading';

export const metadata: Metadata = { title: '회원' };

/** A2 회원 목록. 검색 조건을 URL(`useSearchParams`)에서 읽으므로 Suspense로 감싼다. */
export default function MembersPage() {
  return (
    <Suspense fallback={<ScreenLoading message="불러오고 있습니다…" />}>
      <MemberListScreen />
    </Suspense>
  );
}
