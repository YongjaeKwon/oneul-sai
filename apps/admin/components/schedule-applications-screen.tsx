'use client';

import {
  ScheduleIdSchema,
  type AdminSchedule,
  type Meetup,
} from '@oneul-sai/contracts';
import { Badge, Button, Dialog } from '@oneul-sai/ui';
import Link from 'next/link';
import { useId, useState } from 'react';

import {
  APPLICATION_ERROR_OVERRIDES,
  APPLICATION_FILTERS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  CANCELLED_BY_LABELS,
  MEMBER_LOOKUP_FAILED_MESSAGE,
  adminCancelQuestion,
  applicationFilterOf,
  formatAppliedCounts,
  memberIdsOf,
  mergeApplicants,
  type ApplicationFilter,
  type ApplicationRow,
} from '@/lib/applications';
import { useEndSessionOn401 } from '@/lib/auth-provider';
import { describeEventError, isApiClientError } from '@/lib/errors';
import {
  EMPTY,
  GENDER_LABELS,
  formatDateTime,
  formatPhone,
  formatScheduleRange,
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
  useEndSessionOn401(error ?? members.error ?? cancel.error);
  const [target, setTarget] = useState<ApplicationRow | null>(null);
  const questionId = useId();

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
  const memberLookupFailed =
    members.error !== null &&
    !(isApiClientError(members.error) && members.error.status === 401);

  return (
    <div className="flex flex-col gap-4">
      {memberLookupFailed ? (
        <Notice tone="danger">{MEMBER_LOOKUP_FAILED_MESSAGE}</Notice>
      ) : null}
      {cancel.error ? (
        <Notice tone="danger">
          {describeEventError(cancel.error, APPLICATION_ERROR_OVERRIDES)}
        </Notice>
      ) : null}

      <div
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
              rows.map((row) => (
                <ApplicationRowView
                  key={row.application.id}
                  row={row}
                  cancelDisabled={cancel.isPending}
                  onCancel={() => {
                    cancel.reset();
                    setTarget(row);
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
        open={target !== null}
        title="신청 취소"
        onClose={() => setTarget(null)}
        describedBy={questionId}
      >
        {target !== null ? (
          <>
            <p id={questionId}>{adminCancelQuestion(target.member)}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={cancel.isPending}
                onClick={() =>
                  cancel.mutate(target.application.id, {
                    onSettled: () => setTarget(null),
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
                onClick={() => setTarget(null)}
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
  cancelDisabled,
  onCancel,
}: {
  row: ApplicationRow;
  cancelDisabled: boolean;
  onCancel: () => void;
}) {
  const cancelled = application.status === 'CANCELLED';
  const accountNote =
    member?.status === 'SUSPENDED'
      ? '정지'
      : member?.status === 'WITHDRAWN'
        ? '탈퇴한 회원'
        : '';

  return (
    <tr className="align-top hover:bg-ivory">
      <td className="px-4 py-3 whitespace-nowrap text-ink tabular-nums">
        {formatDateTime(application.createdAt)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <Link
          href={`/members/${application.memberId}`}
          className={linkClasses}
          aria-label={member?.name ? undefined : '회원 상세'}
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
      <td className="px-4 py-3 whitespace-nowrap text-ink">{accountNote}</td>
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
        {cancelled ? formatDateTime(application.updatedAt) : ''}
      </td>
      <td className="px-4 py-3 text-right">
        {cancelled ? null : (
          <Button
            variant="secondary"
            disabled={cancelDisabled}
            aria-label={`${member?.name ?? '이 회원'}의 신청 취소`}
            onClick={onCancel}
          >
            취소
          </Button>
        )}
      </td>
    </tr>
  );
}
