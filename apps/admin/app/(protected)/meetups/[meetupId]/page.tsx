import type { Metadata } from 'next';
import { Suspense } from 'react';

import { MeetupDetailScreen } from '@/components/meetup-detail-screen';
import { ScreenLoading } from '@/components/screen-loading';

export const metadata: Metadata = { title: '모임 상품 상세' };

/** A6 상품 상세. 여러 회차 등록 뒤의 알림(`?registered=N`)을 URL에서 읽으므로 Suspense로 감싼다. */
export default async function MeetupDetailPage({
  params,
}: {
  params: Promise<{ meetupId: string }>;
}) {
  const { meetupId } = await params;
  return (
    <Suspense fallback={<ScreenLoading message="불러오고 있습니다…" />}>
      <MeetupDetailScreen meetupId={meetupId} />
    </Suspense>
  );
}
