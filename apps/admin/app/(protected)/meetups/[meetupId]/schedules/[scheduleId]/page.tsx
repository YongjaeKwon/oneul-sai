import type { Metadata } from 'next';

import { ScheduleDetailScreen } from '@/components/schedule-detail-screen';

export const metadata: Metadata = { title: '회차 상세' };

/** A8 회차 상세 — 수정 · 상태 전이 · 삭제 · 장소 안내 미리보기. */
export default async function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ meetupId: string; scheduleId: string }>;
}) {
  const { meetupId, scheduleId } = await params;
  return <ScheduleDetailScreen meetupId={meetupId} scheduleId={scheduleId} />;
}
