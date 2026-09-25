import type { PublicScheduleListResponse } from '@oneul-sai/contracts';
import { Badge, Highlight } from '@oneul-sai/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';

import { FormAlert } from '@/components/form-alert';
import { PageTitle } from '@/components/page-title';
import {
  formatCapacity,
  formatDateTime,
  formatMaleAgeRange,
  formatPrice,
  scheduleBadgeLabel,
} from '@/lib/format';
import { listPublicEvents } from '@/lib/public-api';

export const metadata: Metadata = { title: '다가오는 일정' };

const pageLinkClasses =
  'rounded-control px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-rose-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose';

interface EventsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// W8 일정 목록(SPEC-002 4절). 서버 렌더 — 공개 조회는 lib/public-api.ts의 데이터 캐시(30초)를 거친다.
// 남은 자리 수 대신 모집 마감 · 성별 자리 마감만 보이고(SPEC-003 E · D10), 회차별로 "N명과 대화"를 약속하지 않는다(결정 예정 (Step 5)).
export default async function EventsPage({ searchParams }: EventsPageProps) {
  const { page } = await searchParams;

  let data: PublicScheduleListResponse | null = null;
  try {
    data = await listPublicEvents(page);
  } catch (error) {
    unstable_rethrow(error);
    // 5xx · 네트워크. 목록 요청은 page를 고정해 부르므로 4xx가 나지 않는다.
  }

  const lastPage =
    data === null ? 1 : Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-6 py-12">
      <PageTitle
        title={
          <>
            다가오는 <Highlight>일정</Highlight>
          </>
        }
      />

      {data === null ? (
        <FormAlert>
          일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </FormAlert>
      ) : data.items.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-soft">
          지금은 열려 있는 일정이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.items.map((schedule) => {
            const ageRange = formatMaleAgeRange(
              schedule.maleMinBirthYear,
              schedule.maleMaxBirthYear,
            );
            const badge = scheduleBadgeLabel(schedule);
            return (
              <li key={schedule.id}>
                <Link
                  href={`/events/${schedule.id}`}
                  className="flex flex-col gap-2 rounded-card border border-line bg-surface p-6 transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-display text-lg font-semibold text-ink tabular-nums">
                      {formatDateTime(schedule.startsAt)}
                    </p>
                    {badge !== null ? <Badge>{badge}</Badge> : null}
                  </div>
                  <h2 className="text-base font-semibold text-ink">
                    {schedule.title}
                  </h2>
                  <p className="text-sm text-ink-soft">{schedule.venueArea}</p>
                  <p className="text-sm text-ink tabular-nums">
                    {formatPrice(schedule.priceMale, schedule.priceFemale)}
                    {' · '}
                    {formatCapacity(
                      schedule.capacityMale,
                      schedule.capacityFemale,
                    )}
                  </p>
                  {ageRange ? (
                    <p className="text-sm text-ink tabular-nums">{ageRange}</p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {data !== null && (data.page > 1 || data.page < lastPage) ? (
        <nav aria-label="페이지" className="flex justify-between">
          {data.page > 1 ? (
            <Link
              href={`/events?page=${data.page - 1}`}
              className={pageLinkClasses}
            >
              이전
            </Link>
          ) : (
            <span />
          )}
          {data.page < lastPage ? (
            <Link
              href={`/events?page=${data.page + 1}`}
              className={pageLinkClasses}
            >
              다음
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
