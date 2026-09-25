import { API_ERROR_CODES, type PublicSchedule } from '@oneul-sai/contracts';
import { Badge } from '@oneul-sai/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, unstable_rethrow } from 'next/navigation';

import { ApplyArea } from '@/components/apply-area';
import { FormAlert } from '@/components/form-alert';
import { PageTitle } from '@/components/page-title';
import { isApiClientError } from '@/lib/errors';
import {
  FEMALE_AGE_NOTE,
  formatCapacity,
  formatDateTime,
  formatMaleAgeRange,
  formatPrice,
  formatTimeRange,
  hasStarted,
  scheduleBadgeLabel,
} from '@/lib/format';
import { getPublicEvent } from '@/lib/public-api';

export const metadata: Metadata = { title: '일정' };

const listLinkClasses =
  'self-center rounded-control px-3 py-2 text-sm font-medium text-ink underline underline-offset-4 transition-colors hover:bg-rose-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose';

interface EventPageProps {
  params: Promise<{ id: string }>;
}

// W9 일정 상세(SPEC-002 4절). 장소는 지역만 — 정확한 장소는 공개 응답에 없다(D4).
// 본문 아래 참가 신청 영역은 클라이언트 컴포넌트다(SPEC-003 4절) — 신청 데이터는 서버 렌더 · 캐시에 들어가지 않는다.
export default async function EventPage({ params }: EventPageProps) {
  const { id } = await params;

  let schedule: PublicSchedule | null = null;
  try {
    schedule = await getPublicEvent(id);
  } catch (error) {
    unstable_rethrow(error);
    // 없음 · DRAFT · CANCELLED는 같은 404다(D14). 그 밖(5xx · 네트워크)은 아래 문구.
    if (
      isApiClientError(error) &&
      error.code === API_ERROR_CODES.SCHEDULE_NOT_FOUND
    ) {
      notFound();
    }
  }

  if (schedule === null) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-6 py-12">
        <FormAlert>
          일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </FormAlert>
        <Link href="/events" className={listLinkClasses}>
          일정 목록으로
        </Link>
      </main>
    );
  }

  const ageRange = formatMaleAgeRange(
    schedule.maleMinBirthYear,
    schedule.maleMaxBirthYear,
  );
  const badge = scheduleBadgeLabel(schedule);
  const started = hasStarted(schedule);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-6 py-12">
      <PageTitle title={schedule.title} />

      {started ? (
        <p className="text-center text-sm text-ink-soft">지난 일정입니다.</p>
      ) : null}

      {schedule.description ? (
        <p className="text-base whitespace-pre-line text-ink">
          {schedule.description}
        </p>
      ) : null}

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-lg font-semibold text-ink tabular-nums">
            {formatTimeRange(schedule.startsAt, schedule.endsAt)}
          </p>
          {badge !== null ? <Badge>{badge}</Badge> : null}
        </div>
        <ul className="flex flex-col gap-3 text-sm text-ink">
          <li className="tabular-nums">
            신청 마감 {formatDateTime(schedule.applyDeadlineAt)}
          </li>
          <li>
            {schedule.venueArea}
            <span className="block text-ink-soft">
              정확한 장소는 참가가 확정된 분께 행사 전에 안내드릴게요.
            </span>
          </li>
          {ageRange ? (
            <li className="tabular-nums">
              {ageRange}
              <span className="block text-ink-soft">{FEMALE_AGE_NOTE}</span>
            </li>
          ) : null}
          <li className="tabular-nums">
            {formatPrice(schedule.priceMale, schedule.priceFemale)}
          </li>
          <li className="tabular-nums">
            {formatCapacity(schedule.capacityMale, schedule.capacityFemale)}
          </li>
        </ul>
      </section>

      {/* (a) 지난 일정에는 신청 영역을 두지 않는다 */}
      {started ? null : <ApplyArea schedule={schedule} />}

      <p className="text-sm text-ink-soft">
        행사 당일에는 출생연도와 본인 확인이 가능한 신분증을 지참해 주세요.
      </p>

      <Link href="/events" className={listLinkClasses}>
        일정 목록으로
      </Link>
    </main>
  );
}
