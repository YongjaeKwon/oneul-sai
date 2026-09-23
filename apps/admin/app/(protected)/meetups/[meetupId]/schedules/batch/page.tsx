import type { Metadata } from 'next';

import { ScheduleBatchScreen } from '@/components/schedule-batch-screen';

export const metadata: Metadata = { title: '여러 회차 등록' };

/** A9 여러 회차 등록(D15). `batch`는 고정 경로라 `[scheduleId]`보다 먼저 맞는다. */
export default async function ScheduleBatchPage({
  params,
}: {
  params: Promise<{ meetupId: string }>;
}) {
  const { meetupId } = await params;
  return <ScheduleBatchScreen meetupId={meetupId} />;
}
