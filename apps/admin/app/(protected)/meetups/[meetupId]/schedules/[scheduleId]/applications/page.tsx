import type { Metadata } from 'next';

import { ScheduleApplicationsScreen } from '@/components/schedule-applications-screen';

export const metadata: Metadata = { title: '신청 목록' };

/** A10 신청 목록(SPEC-003 4절) — 상태 필터는 주소의 `?status=`. */
export default async function ScheduleApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ meetupId: string; scheduleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { meetupId, scheduleId } = await params;
  const { status } = await searchParams;
  return (
    <ScheduleApplicationsScreen
      meetupId={meetupId}
      scheduleId={scheduleId}
      status={status}
    />
  );
}
