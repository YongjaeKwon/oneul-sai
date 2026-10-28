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
  canInvite,
  formatAppliedCounts,
  inviteErrorOverrides,
  inviteQuestion,
  memberIdsOf,
  memberLookupNotice,
  mergeApplicants,
  outsideBirthYears,
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
  useInviteApplication,
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

/** 확인 창이 묻는 동작 — 접수 줄의 참가 가능 안내(SPEC-003 D16) 또는 운영자 취소. */
interface DialogTarget {
  applicationId: string;
  action: 'invite' | 'cancel';
}

/** A10 신청 목록(`/meetups/[meetupId]/schedules/[scheduleId]/applications`, SPEC-003 4절). */
export function ScheduleApplicationsScreen({
  meetupId,
  scheduleId,
  status,
}: {
  meetupId: string;
  scheduleId: string;
  /** 주소의 `?status=` 원문. 모르는 값은 기본 필터("전체")로 읽는다. */
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

  // 다시 부르기만 실패했으면(가진 회차가 있으면) 목록을 그대로 둔다
  if (!validId || (error && schedule === undefined)) {
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

  const filter = applicationFilterOf(status);

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

/** 상태 필터(접수 · 입금 대기 · 참가 확정 · 취소 · 전체) — 주소의 `?status=`에 둔다(새로 고쳐도 · 링크로 보내도 같은 목록). */
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
              'rounded-control border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-ink',
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
  const invite = useInviteApplication(meetupId, scheduleId);
  useEndSessionOn401(error);
  useEndSessionOn401(members.error);
  useEndSessionOn401(cancel.error);
  useEndSessionOn401(invite.error);
  const busy = cancel.isPending || invite.isPending;
  // 확인 창은 신청 ID · 동작만 쥐고 회원은 지금의 행에서 읽는다 — 창을 연 뒤 도착한 이름도 질문에 들어가게
  const [target, setTarget] = useState<DialogTarget | null>(null);
  const questionId = useId();
  // 동작한 행의 버튼이 사라져도 키보드 포커스가 갈 곳. 창이 닫힐 때(`dialog.close()`) 브라우저가 포커스를 연 버튼으로
  // 되돌리므로, 창이 닫힌 뒤(자식 Dialog의 effect 다음)에 옮긴다
  // 동작이 끝날 때마다 늘린다 — 행이 먼저 사라져 창이 이미 닫혔어도 포커스를 옮기게(target 변화에 기대지 않는다)
  const tableRef = useRef<HTMLDivElement>(null);
  const [actionsSettled, setActionsSettled] = useState(0);
  useEffect(() => {
    if (actionsSettled > 0) {
      tableRef.current?.focus();
    }
  }, [actionsSettled]);

  // 가진 목록이 있으면(다시 부르기만 실패) 표 · 열린 창 · 동작 오류를 그대로 두고 위에 안내만 더한다
  if (error && data === undefined) {
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
  const targetRow: ApplicationRow | undefined = rows.find(
    (row) => row.application.id === target?.applicationId,
  );
  const closeDialog = () => setTarget(null);
  const open = (applicationId: string, action: DialogTarget['action']) => {
    cancel.reset();
    invite.reset();
    setTarget({ applicationId, action });
  };
  const onSettled = () => {
    closeDialog();
    setActionsSettled((count) => count + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Notice tone="danger">{describeEventError(error)}</Notice>
      ) : null}
      {memberNotice !== null ? (
        <Notice tone="danger">{memberNotice}</Notice>
      ) : null}
      {cancel.error ? (
        <Notice tone="danger">
          {describeEventError(cancel.error, APPLICATION_ERROR_OVERRIDES)}
        </Notice>
      ) : null}
      {invite.error && invite.variables !== undefined ? (
        <Notice tone="danger">
          {describeEventError(
            invite.error,
            inviteErrorOverrides(invite.variables.gender),
          )}
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
                <span className="sr-only">동작</span>
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
                  schedule={schedule}
                  ordinal={(data.page - 1) * data.pageSize + index + 1}
                  disabled={busy}
                  onInvite={() => open(row.application.id, 'invite')}
                  onCancel={() => open(row.application.id, 'cancel')}
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
        open={targetRow !== undefined}
        title={target?.action === 'invite' ? '참가 가능 안내' : '신청 취소'}
        onClose={closeDialog}
        describedBy={questionId}
      >
        {targetRow !== undefined && target?.action === 'invite' ? (
          <>
            <p id={questionId}>
              {inviteQuestion(targetRow.member, targetRow.application.gender)}
            </p>
            {/* 자리를 잡는 동작 — 운영자 취소로 자리를 돌려줄 수 있지만 접수로는 돌아가지 않는다. 주 동작 먼저(파운데이션 5절), 처음 포커스는 디자인 담당 확인 항목(SPEC-003 17절) */}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={() =>
                  invite.mutate(targetRow.application, { onSettled })
                }
              >
                {invite.isPending ? '처리 중…' : '참가 가능 안내'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={closeDialog}>
                닫기
              </Button>
            </div>
          </>
        ) : null}
        {targetRow !== undefined && target?.action === 'cancel' ? (
          <>
            <p id={questionId}>{adminCancelQuestion(targetRow.member)}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={() =>
                  cancel.mutate(targetRow.application.id, { onSettled })
                }
              >
                {cancel.isPending ? '처리 중…' : '신청 취소'}
              </Button>
              {/* 되돌릴 수 없는 동작이라 처음 포커스는 "닫기"(디자인 파운데이션 5절) */}
              <Button
                variant="ghost"
                data-autofocus
                disabled={busy}
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
  row,
  schedule,
  ordinal,
  disabled,
  onInvite,
  onCancel,
}: {
  row: ApplicationRow;
  schedule: Parameters<typeof outsideBirthYears>[2];
  /** 지금 목록에서의 줄 번호(페이지를 넘어 이어진다, 필터마다 다르다) — 이름을 모르는 행을 한 화면 안에서 가르는 데 쓴다. */
  ordinal: number;
  disabled: boolean;
  onInvite: () => void;
  onCancel: () => void;
}) {
  const { application, member } = row;
  const cancelled = application.status === 'CANCELLED';
  const appliedAt = formatScheduleTime(application.createdAt);
  // 이름을 모르는 행(탈퇴 · 조회 실패 · 불러오는 중)도 서로 가를 수 있게 목록 줄 번호와 신청 시각을 넣는다
  const who = member?.name ?? `${ordinal}번째 줄(${appliedAt} 신청)`;
  const birthYear = member?.birthYear ?? null;

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
      <td className="px-4 py-3 whitespace-nowrap text-ink tabular-nums">
        {birthYear ?? EMPTY}
        {/* ★S1 (a) — 신청은 막지 않고 운영자가 보고 고른다. 신청 성별의 연령대 쌍과 비교(SPEC-002 D16) */}
        {outsideBirthYears(application.gender, birthYear, schedule) ? (
          <span className="ml-2 text-xs text-ink-soft">연령대 밖</span>
        ) : null}
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
      {/* 줄 표(SPEC-003 4절): 접수 [참가 가능 안내][취소](탈퇴한 회원은 취소만), 입금 대기 · 참가 확정 [취소](입금 확인 · 환불 기록은 SPEC-004 7번 PR) */}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {cancelled ? null : (
          <span className="inline-flex gap-2">
            {canInvite(row) ? (
              <Button
                disabled={disabled}
                aria-label={`${who}에게 참가 가능 안내`}
                onClick={onInvite}
              >
                참가 가능 안내
              </Button>
            ) : null}
            <Button
              variant="secondary"
              disabled={disabled}
              aria-label={`${who}의 신청 취소`}
              onClick={onCancel}
            >
              취소
            </Button>
          </span>
        )}
      </td>
    </tr>
  );
}
