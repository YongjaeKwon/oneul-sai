'use client';

import {
  ScheduleIdSchema,
  type AdminSchedule,
  type Meetup,
} from '@oneul-sai/contracts';
import { Badge, Button, Dialog } from '@oneul-sai/ui';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import {
  APPLICATION_ERROR_OVERRIDES,
  APPLICATION_FILTERS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  CANCELLED_BY_LABELS,
  accountNoteOf,
  adminCancelQuestion,
  applicationFilterOf,
  formatAppliedCounts,
  memberIdsOf,
  memberLookupNotice,
  mergeApplicants,
  type ApplicationFilter,
  type ApplicationRow,
} from '@/lib/applications';
import { useEndSessionOn401 } from '@/lib/auth-provider';
import { describeEventError } from '@/lib/errors';
import {
  EMPTY,
  GENDER_LABELS,
  formatPhone,
  formatScheduleRange,
  formatScheduleTime,
  formatWon,
} from '@/lib/format';
import {
  useCancelApplication,
  useMembersByIds,
  useSchedule,
  useScheduleApplications,
} from '@/lib/queries';
import { BackLink } from './back-link';
import { MeetupScope } from './meetup-scope';
import { Notice } from './notice';
import { PageHeader } from './page-header';
import { Pagination } from './pagination';
import { ScheduleStatusBadge } from './schedule-status-badge';

const COLUMNS = [
  '신청 시각',
  '이름',
  '성별',
  '출생연도',
  '휴대폰',
  '계정 상태',
  '참가비',
  '신청 상태',
  '취소 시각',
] as const;

const linkClasses =
  'text-ink underline decoration-line-strong underline-offset-4 hover:decoration-rose';

/** A10 신청 목록(`/meetups/[meetupId]/schedules/[scheduleId]/applications`, SPEC-003 4절). */
export function ScheduleApplicationsScreen({
  meetupId,
  scheduleId,
  status,
}: {
  meetupId: string;
  scheduleId: string;
  /** 주소의 `?status=` 원문. 모르는 값은 기본 필터로 읽는다. */
  status: string | string[] | undefined;
}) {
  return (
    <MeetupScope meetupId={meetupId}>
      {(meetup) => (
        <ScheduleApplications
          meetup={meetup}
          scheduleId={scheduleId}
          status={status}
        />
      )}
    </MeetupScope>
  );
}

function ScheduleApplications({
  meetup,
  scheduleId,
  status,
}: {
  meetup: Meetup;
  scheduleId: string;
  status: string | string[] | undefined;
}) {
  const validId = ScheduleIdSchema.safeParse(scheduleId).success;
  const {
    data: schedule,
    error,
    dataUpdatedAt,
  } = useSchedule(meetup.id, scheduleId, validId);
  useEndSessionOn401(error);

  const back = (
    <BackLink href={`/meetups/${meetup.id}/schedules/${scheduleId}`}>
      회차 상세
    </BackLink>
  );

  if (!validId || error) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <Notice tone="danger">
          {validId ? describeEventError(error) : '회차 ID 형식이 아닙니다.'}
        </Notice>
      </div>
    );
  }

  if (schedule === undefined) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <p className="py-12 text-center text-sm text-ink-soft" role="status">
          불러오고 있습니다…
        </p>
      </div>
    );
  }

  const filter = applicationFilterOf(status, schedule.status === 'CANCELLED');

  return (
    <div className="flex flex-col gap-6">
      {back}
      <PageHeader title="신청 목록">
        <div>
          <ScheduleStatusBadge schedule={schedule} now={dataUpdatedAt} />
        </div>
        <p className="tabular-nums">
          {formatScheduleRange(schedule.startsAt, schedule.endsAt)} ·{' '}
          {schedule.venueArea} · 신청 {formatAppliedCounts(schedule)}
        </p>
      </PageHeader>

      <FilterLinks schedule={schedule} current={filter} />
      {/* 필터를 바꾸면 첫 페이지 · 비운 확인 창으로 다시 시작한다 */}
      <ApplicationTable key={filter} schedule={schedule} filter={filter} />
    </div>
  );
}

/** 상태 필터(입금 대기 · 취소 · 전체) — 주소의 `?status=`에 둔다(새로 고쳐도 · 링크로 보내도 같은 목록). */
function FilterLinks({
  schedule,
  current,
}: {
  schedule: AdminSchedule;
  current: ApplicationFilter;
}) {
  const base = `/meetups/${schedule.meetupId}/schedules/${schedule.id}/applications`;
  return (
    <nav aria-label="신청 상태" className="flex flex-wrap gap-2">
      {APPLICATION_FILTERS.map(({ value, label }) => {
        const active = value === current;
        return (
          <Link
            key={value}
            href={`${base}?status=${value}`}
            aria-current={active ? 'page' : undefined}
            className={[
              'rounded-control border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose',
              active
                ? 'border-ink bg-surface font-medium text-ink'
                : 'border-line text-ink-soft hover:bg-rose-wash hover:text-ink',
            ].join(' ')}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function ApplicationTable({
  schedule,
  filter,
}: {
  schedule: AdminSchedule;
  filter: ApplicationFilter;
}) {
  const { meetupId, id: scheduleId } = schedule;
  const [page, setPage] = useState(1);
  const { data, error, isFetching } = useScheduleApplications(
    meetupId,
    scheduleId,
    { status: filter === 'ALL' ? undefined : filter, page },
  );
  const members = useMembersByIds(
    data === undefined ? [] : memberIdsOf(data.items),
  );
  const cancel = useCancelApplication(meetupId, scheduleId);
  useEndSessionOn401(error);
  useEndSessionOn401(members.error);
  useEndSessionOn401(cancel.error);
  // 확인 창은 신청 ID만 쥐고 회원은 지금의 행에서 읽는다 — 창을 연 뒤 도착한 이름도 질문에 들어가게
  const [targetId, setTargetId] = useState<string | null>(null);
  const questionId = useId();
  // 취소한 행의 버튼이 사라져도 키보드 포커스가 갈 곳. 창이 닫힐 때(`dialog.close()`) 브라우저가 포커스를 연 버튼으로
  // 되돌리므로, 창이 닫힌 뒤(자식 Dialog의 effect 다음)에 옮긴다
  const tableRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (targetId === null && returnFocus.current) {
      returnFocus.current = false;
      tableRef.current?.focus();
    }
  }, [targetId]);

  if (error) {
    return <Notice tone="danger">{describeEventError(error)}</Notice>;
  }
  if (data === undefined) {
    return (
      <p className="py-12 text-center text-sm text-ink-soft" role="status">
        불러오고 있습니다…
      </p>
    );
  }

  const rows = mergeApplicants(data.items, members.data?.items);
  const memberNotice = memberLookupNotice(members.error);
  const target: ApplicationRow | undefined = rows.find(
    (row) => row.application.id === targetId,
  );
  const closeDialog = () => setTargetId(null);

  return (
    <div className="flex flex-col gap-4">
      {memberNotice !== null ? (
        <Notice tone="danger">{memberNotice}</Notice>
      ) : null}
      {cancel.error ? (
        <Notice tone="danger">
          {describeEventError(cancel.error, APPLICATION_ERROR_OVERRIDES)}
        </Notice>
      ) : null}

      <div
        ref={tableRef}
        tabIndex={-1}
        aria-busy={isFetching}
        className={[
          'overflow-x-auto rounded-card border border-line bg-surface transition-opacity',
          isFetching ? 'opacity-60' : '',
        ].join(' ')}
      >
        <table className="w-full min-w-max text-left text-sm">
          <thead className="border-b border-line text-xs text-ink-soft">
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-4 py-3 font-medium whitespace-nowrap"
                >
                  {column}
                </th>
              ))}
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">취소</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 1}
                  className="px-4 py-12 text-center text-ink-soft"
                >
                  조건에 맞는 신청이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <ApplicationRowView
                  key={row.application.id}
                  row={row}
                  ordinal={(data.page - 1) * data.pageSize + index + 1}
                  cancelDisabled={cancel.isPending}
                  onCancel={() => {
                    cancel.reset();
                    setTargetId(row.application.id);
                  }}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        disabled={isFetching}
        onChange={setPage}
      />

      <Dialog
        open={target !== undefined}
        title="신청 취소"
        onClose={closeDialog}
        describedBy={questionId}
      >
        {target !== undefined ? (
          <>
            <p id={questionId}>{adminCancelQuestion(target.member)}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={cancel.isPending}
                onClick={() =>
                  cancel.mutate(target.application.id, {
                    onSettled: () => {
                      returnFocus.current = true;
                      closeDialog();
                    },
                  })
                }
              >
                {cancel.isPending ? '처리 중…' : '신청 취소'}
              </Button>
              {/* 되돌릴 수 없는 동작이라 처음 포커스는 "닫기"(디자인 파운데이션 5절) */}
              <Button
                variant="ghost"
                data-autofocus
                disabled={cancel.isPending}
                onClick={closeDialog}
              >
                닫기
              </Button>
            </div>
          </>
        ) : null}
      </Dialog>
    </div>
  );
}

function ApplicationRowView({
  row: { application, member },
  ordinal,
  cancelDisabled,
  onCancel,
}: {
  row: ApplicationRow;
  /** 신청 순 번호(페이지를 넘어 이어진다) — 이름을 모르는 행을 서로 가르는 데 쓴다. */
  ordinal: number;
  cancelDisabled: boolean;
  onCancel: () => void;
}) {
  const cancelled = application.status === 'CANCELLED';
  const appliedAt = formatScheduleTime(application.createdAt);
  // 이름을 모르는 행(탈퇴 · 조회 실패 · 불러오는 중)도 서로 가를 수 있게 신청 순번을 넣는다(같은 분의 신청도 갈린다)
  const who = member?.name ?? `${ordinal}번째 신청자`;

  return (
    <tr className="align-top hover:bg-ivory">
      <td className="px-4 py-3 whitespace-nowrap text-ink tabular-nums">
        {appliedAt}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <Link
          href={`/members/${application.memberId}`}
          className={linkClasses}
          aria-label={member?.name ? undefined : `${who} 회원 상세`}
        >
          {member?.name ?? EMPTY}
        </Link>
      </td>
      <td className="px-4 py-3 text-ink">
        {GENDER_LABELS[application.gender]}
      </td>
      <td className="px-4 py-3 text-ink tabular-nums">
        {member?.birthYear ?? EMPTY}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-ink tabular-nums">
        {formatPhone(member?.phone ?? null)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-ink">
        {accountNoteOf(member)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-ink tabular-nums">
        {formatWon(application.price)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <Badge tone={APPLICATION_STATUS_TONES[application.status]}>
          {APPLICATION_STATUS_LABELS[application.status]}
        </Badge>
        {application.cancelledBy !== null ? (
          <span className="ml-2 text-xs text-ink-soft">
            {CANCELLED_BY_LABELS[application.cancelledBy]}
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-ink tabular-nums">
        {cancelled ? formatScheduleTime(application.updatedAt) : ''}
      </td>
      <td className="px-4 py-3 text-right">
        {cancelled ? null : (
          <Button
            variant="secondary"
            disabled={cancelDisabled}
            aria-label={`${who}의 신청 취소`}
            onClick={onCancel}
          >
            취소
          </Button>
        )}
      </td>
    </tr>
  );
}
