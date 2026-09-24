'use client';

import {
  ADMIN_LIST_MAX_PAGE_SIZE,
  SCHEDULE_STATUSES,
  ScheduleStatusSchema,
  type ScheduleStatus,
} from '@oneul-sai/contracts';
import { Button, Label } from '@oneul-sai/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { apiClient } from '@/lib/api';
import { useAuth, useEndSessionOn401 } from '@/lib/auth-provider';
import {
  describeError,
  describeEventError,
  isApiClientError,
} from '@/lib/errors';
import { selectClasses } from '@/lib/form-styles';
import {
  EMPTY,
  SCHEDULE_STATUS_LABELS,
  formatCapacity,
  formatMaleBirthYears,
  formatPrice,
  formatScheduleRange,
} from '@/lib/format';
import { meetupKeys, useScheduleList } from '@/lib/queries';
import { publishInOrder, type PublishResult } from '@/lib/schedule-batch';
import { startOfSeoulToday } from '@/lib/schedule-form';
import { Dialog } from './dialog';
import { Notice } from './notice';
import { Pagination } from './pagination';
import { ScheduleStatusBadge } from './schedule-status-badge';

interface Progress {
  total: number;
  done: number;
  ok: number;
  failed: number;
  running: boolean;
}

/**
 * A6 아래쪽 회차 목록 — 상태 · 기간 필터(기본 "오늘 이후"), 한 줄에 일시 · 지역 · 참가비 · 정원 · 남성 연령대 · 상태.
 * DRAFT 행을 골라 "선택한 회차 공개"하면 회차마다 상태 API를 차례로 부르고 행마다 결과를 붙인다(D15).
 * 한 페이지(최대 100개)가 한 번에 고를 수 있는 수의 상한이다.
 */
export function ScheduleList({ meetupId }: { meetupId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { endSession } = useAuth();
  const statusId = useId();
  const pastId = useId();

  const [status, setStatus] = useState<ScheduleStatus | ''>('');
  const [includePast, setIncludePast] = useState(false);
  const [page, setPage] = useState(1);
  const [todayStart] = useState(() => startOfSeoulToday(Date.now()));

  const { data, error, isFetching, dataUpdatedAt } = useScheduleList(meetupId, {
    status: status === '' ? undefined : status,
    from: includePast ? undefined : todayStart,
    page,
    pageSize: ADMIN_LIST_MAX_PAGE_SIZE,
  });
  useEndSessionOn401(error);

  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [results, setResults] = useState<Record<string, PublishResult>>({});
  const [stopMessage, setStopMessage] = useState<string | null>(null);

  const items = data?.items ?? [];
  const draftIds = new Set(
    items.filter((item) => item.status === 'DRAFT').map((item) => item.id),
  );
  // 고른 순서를 지킨다. 목록에서 사라졌거나 DRAFT가 아닌 행은 뺀다.
  const chosen = selected.filter((id) => draftIds.has(id));
  const running = progress?.running === true;

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) =>
      checked ? [...prev, id] : prev.filter((value) => value !== id),
    );

  const publishChosen = async () => {
    setConfirming(false);
    const ids = chosen;
    setResults({});
    setStopMessage(null);
    setProgress({
      total: ids.length,
      done: 0,
      ok: 0,
      failed: 0,
      running: true,
    });

    const { stoppedBy } = await publishInOrder(
      ids,
      (id) => apiClient.updateScheduleStatus(meetupId, id, { status: 'OPEN' }),
      (id, result) => {
        setResults((prev) => ({ ...prev, [id]: result }));
        setProgress(
          (prev) =>
            prev && {
              ...prev,
              done: prev.done + 1,
              ok: prev.ok + (result.ok ? 1 : 0),
              failed: prev.failed + (result.ok ? 0 : 1),
            },
        );
      },
    );

    setProgress((prev) => prev && { ...prev, running: false });
    setSelected([]);
    if (stoppedBy !== null) {
      setStopMessage(
        `${describeError(stoppedBy)} 남은 회차는 공개하지 않았습니다.`,
      );
      if (isApiClientError(stoppedBy) && stoppedBy.status === 401) {
        endSession();
        return;
      }
    }
    void queryClient.invalidateQueries({
      queryKey: meetupKeys.schedules(meetupId),
    });
  };

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
    setSelected([]);
    setResults({});
    setProgress(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-40">
            <Label htmlFor={statusId}>상태</Label>
            <select
              id={statusId}
              value={status}
              disabled={running}
              className={`${selectClasses} mt-1.5`}
              onChange={(event) => {
                const parsed = ScheduleStatusSchema.safeParse(
                  event.target.value,
                );
                changeFilter(() =>
                  setStatus(parsed.success ? parsed.data : ''),
                );
              }}
            >
              <option value="">전체</option>
              {SCHEDULE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {/* OPEN에는 신청 마감이 지나 "모집 마감"으로 보이는 회차도 있다 — 상태 이름으로 거른다 */}
                  {value === 'OPEN' ? '공개' : SCHEDULE_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <label
            htmlFor={pastId}
            className="flex h-10 items-center gap-2 text-sm text-ink"
          >
            <input
              id={pastId}
              type="checkbox"
              checked={includePast}
              disabled={running}
              className="size-4 accent-ink"
              onChange={(event) =>
                changeFilter(() => setIncludePast(event.target.checked))
              }
            />
            지난 회차 포함
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => router.push(`/meetups/${meetupId}/schedules/new`)}
          >
            회차 만들기
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push(`/meetups/${meetupId}/schedules/batch`)}
          >
            여러 회차 등록
          </Button>
          <Button
            disabled={chosen.length === 0 || running}
            onClick={() => setConfirming(true)}
          >
            선택한 회차 공개({chosen.length})
          </Button>
        </div>
      </div>

      {progress !== null ? (
        <Notice
          tone={!progress.running && progress.failed > 0 ? 'danger' : 'info'}
        >
          {progress.running
            ? `${progress.total}개 중 ${progress.done}개 처리 · 공개 ${progress.ok}개 · 실패 ${progress.failed}개`
            : `${progress.total}개 중 ${progress.ok}개를 공개했습니다.${
                progress.failed > 0
                  ? ` 실패한 ${progress.failed}개는 표에서 이유를 확인해 주세요.`
                  : ''
              }`}
        </Notice>
      ) : null}
      {stopMessage !== null ? (
        <Notice tone="danger">{stopMessage}</Notice>
      ) : null}

      {error ? (
        <Notice tone="danger">{describeEventError(error)}</Notice>
      ) : data === undefined ? (
        <p className="py-12 text-center text-sm text-ink-soft" role="status">
          불러오고 있습니다…
        </p>
      ) : (
        <>
          {/* 상세의 카드(Section) 안이라 표에는 테두리 · 배경을 다시 두지 않는다(디자인 파운데이션 4절 6) */}
          <div
            aria-busy={isFetching || running}
            className={[
              'relative overflow-x-auto transition-opacity',
              isFetching ? 'opacity-60' : '',
            ].join(' ')}
          >
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b border-line text-xs text-ink-soft">
                <tr>
                  <th scope="col" className="w-10 px-4 py-3">
                    <span className="sr-only">공개할 회차 고르기</span>
                  </th>
                  {[
                    '일시',
                    '지역',
                    '참가비',
                    '정원',
                    '남성 연령대',
                    '상태',
                  ].map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="px-4 py-3 font-medium whitespace-nowrap"
                    >
                      {column}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">상세</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-ink-soft"
                    >
                      조건에 맞는 회차가 없습니다.
                    </td>
                  </tr>
                ) : (
                  items.map((schedule) => {
                    const when = formatScheduleRange(
                      schedule.startsAt,
                      schedule.endsAt,
                    );
                    // 같은 일시의 회차가 지역만 달리 있을 수 있어 지역까지 읽어 준다
                    const rowName = `${when} · ${schedule.venueArea}`;
                    const result = results[schedule.id];
                    return (
                      <tr
                        key={schedule.id}
                        className="align-top hover:bg-ivory"
                      >
                        <td className="px-4 py-3">
                          {schedule.status === 'DRAFT' ? (
                            <input
                              type="checkbox"
                              aria-label={`${rowName} 고르기`}
                              checked={chosen.includes(schedule.id)}
                              disabled={running}
                              className="size-4 accent-ink"
                              onChange={(event) =>
                                toggle(schedule.id, event.target.checked)
                              }
                            />
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-display whitespace-nowrap text-ink tabular-nums">
                          {when}
                        </td>
                        <td className="px-4 py-3 text-ink">
                          {schedule.venueArea}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-ink tabular-nums">
                          {formatPrice(
                            schedule.priceMale,
                            schedule.priceFemale,
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-ink tabular-nums">
                          {formatCapacity(
                            schedule.capacityMale,
                            schedule.capacityFemale,
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-ink-soft tabular-nums">
                          {formatMaleBirthYears(
                            schedule.maleMinBirthYear,
                            schedule.maleMaxBirthYear,
                          ) || EMPTY}
                        </td>
                        <td className="px-4 py-3">
                          <ScheduleStatusBadge
                            schedule={schedule}
                            now={dataUpdatedAt}
                          />
                          {result !== undefined ? (
                            <p
                              className={[
                                'mt-1 max-w-56 text-xs whitespace-normal',
                                result.ok ? 'text-ink-soft' : 'text-danger',
                              ].join(' ')}
                            >
                              {result.ok ? '공개됨' : result.message}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/meetups/${meetupId}/schedules/${schedule.id}`}
                            className="whitespace-nowrap text-ink underline decoration-line-strong underline-offset-4 hover:decoration-rose"
                            aria-label={`${rowName} 상세`}
                          >
                            상세
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            disabled={isFetching || running}
            onChange={(next) => {
              setPage(next);
              setSelected([]);
            }}
          />
        </>
      )}

      <Dialog
        open={confirming}
        title="선택한 회차 공개"
        onClose={() => setConfirming(false)}
      >
        <p>
          {chosen.length}개 회차를 공개합니다. 참가자 일정 화면에 30초 안에
          보입니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void publishChosen()}>공개</Button>
          {/* 공개한 회차는 비공개로 되돌릴 수 없다 — 처음 포커스는 "닫기"(Dialog가 showModal 뒤 옮긴다) */}
          <Button
            variant="ghost"
            data-autofocus
            onClick={() => setConfirming(false)}
          >
            닫기
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
