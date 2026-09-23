import type { AdminSchedule } from '@oneul-sai/contracts';
import { Badge } from '@oneul-sai/ui';

import { scheduleStatusView } from '@/lib/format';

/** 회차 상태 배지. 글자가 뜻을 전하고 색은 보조한다. `now`는 목록 · 상세를 불러온 시각. */
export function ScheduleStatusBadge({
  schedule,
  now,
}: {
  schedule: Pick<AdminSchedule, 'status' | 'applyDeadlineAt'>;
  now: number;
}) {
  const view = scheduleStatusView(schedule, now);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge tone={view.tone}>{view.label}</Badge>
      {view.note !== undefined ? (
        <span className="text-xs text-ink-soft">{view.note}</span>
      ) : null}
    </span>
  );
}
