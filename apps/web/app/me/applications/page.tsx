import type { Metadata } from 'next';

import { MyApplicationsScreen } from '@/components/my-applications-screen';
import { PageTitle } from '@/components/page-title';
import { normalizePage } from '@/lib/format';

export const metadata: Metadata = { title: '내 신청' };

interface MyApplicationsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// W10 내 신청(SPEC-003 4절). 로그인 확인은 /me 레이아웃, 보호 데이터는 클라이언트 컴포넌트가 TanStack Query로 조회한다.
export default async function MyApplicationsPage({
  searchParams,
}: MyApplicationsPageProps) {
  const { page } = await searchParams;

  return (
    <>
      <PageTitle title="내 신청" />
      <MyApplicationsScreen page={normalizePage(page)} />
    </>
  );
}
