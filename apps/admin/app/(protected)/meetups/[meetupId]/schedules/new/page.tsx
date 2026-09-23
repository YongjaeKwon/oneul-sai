import type { Metadata } from 'next';

import { ScheduleCreateScreen } from '@/components/schedule-detail-screen';

export const metadata: Metadata = { title: '회차 만들기' };

/** A7 회차 만들기. 경로의 `meetupId`만 서버에서 읽는다. */
export default async function NewSchedulePage({
  params,
}: {
  params: Promise<{ meetupId: string }>;
}) {
  const { meetupId } = await params;
  return <ScheduleCreateScreen meetupId={meetupId} />;
}
