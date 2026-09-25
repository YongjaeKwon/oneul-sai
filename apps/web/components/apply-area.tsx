'use client';

import {
  API_ERROR_CODES,
  type MemberProfile,
  type PublicSchedule,
} from '@oneul-sai/contracts';
import { Badge, Button } from '@oneul-sai/ui';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormAlert } from '@/components/form-alert';
import {
  ADMIN_ACCOUNT_MESSAGE,
  applyAreaState,
  birthYearRuleMessage,
  CANCEL_CONFIRM_MESSAGE,
  describeApplicationError,
  genderFullMessage,
  NOT_CANCELLABLE_MESSAGE,
  PENDING_NOTE,
  RECRUITMENT_CLOSED_MESSAGE,
  REAPPLY_BLOCKED_MESSAGE,
} from '@/lib/applications';
import { useAuth, useEndSessionOn401 } from '@/lib/auth';
import { describeError, isApiClientError, isSessionEnded } from '@/lib/errors';
import {
  APPLICATION_STATUS_LABELS,
  formatDateTime,
  formatFee,
  formatWon,
} from '@/lib/format';
import {
  useApply,
  useCancelMyApplication,
  useMe,
  useMyApplications,
} from '@/lib/queries';

const linkClasses = 'font-medium text-ink underline underline-offset-4';

interface Notice {
  message: string;
  /** 409 `PENDING_APPLICATION_LIMIT` — "내 신청" 링크를 함께 보인다(L의 하위 확인). */
  myApplicationsLink: boolean;
}

/**
 * W9 일정 상세의 참가 신청 영역(SPEC-003 4절). 신청 데이터는 서버 렌더에 들어가지 않는다 — 여기서 TanStack Query로 부른다.
 * (a) 지난 일정은 페이지가 이 영역을 두지 않는다. 판정은 `applyAreaState`, 문구는 4절 표.
 */
export function ApplyArea({ schedule }: { schedule: PublicSchedule }) {
  const { state: auth, endSession } = useAuth();
  const me = useMe();
  // 운영자 계정은 `/api/v1/applications`가 403이라 부르지 않는다(d).
  const mine = useMyApplications(
    { scheduleId: schedule.id },
    me.data?.role === 'MEMBER',
  );
  useEndSessionOn401(me.error ?? mine.error);
  const apply = useApply();
  const cancel = useCancelMyApplication();
  const [dialog, setDialog] = useState<'none' | 'apply' | 'cancel'>('none');
  const [notice, setNotice] = useState<Notice | null>(null);

  if (auth.status === 'anonymous') {
    return (
      <Area>
        <p className="text-sm text-ink">
          참가 신청은 로그인한 뒤 할 수 있습니다.
        </p>
        <Link
          href={`/login?next=/events/${schedule.id}`}
          className={linkClasses}
        >
          로그인
        </Link>
      </Area>
    );
  }

  const loadError = me.error ?? mine.error;
  if (loadError !== null && !isSessionEnded(loadError)) {
    return (
      <Area>
        <FormAlert>{describeError(loadError)}</FormAlert>
      </Area>
    );
  }

  if (me.data === undefined) {
    return <Loading />;
  }

  const profile: MemberProfile = me.data;
  const area = applyAreaState(schedule, profile, mine.data?.items);
  const genderCopy =
    profile.gender === null
      ? {}
      : {
          [API_ERROR_CODES.SCHEDULE_FULL]: genderFullMessage(profile.gender),
          [API_ERROR_CODES.BIRTH_YEAR_OUT_OF_RANGE]: birthYearRuleMessage(
            schedule.maleMinBirthYear,
            schedule.maleMaxBirthYear,
          ),
        };

  const fail = (error: unknown) => {
    if (isSessionEnded(error)) {
      endSession();
      return;
    }
    setNotice({
      message: describeApplicationError(error, genderCopy),
      myApplicationsLink:
        isApiClientError(error) &&
        error.code === API_ERROR_CODES.PENDING_APPLICATION_LIMIT,
    });
  };

  const submitApply = () => {
    setNotice(null);
    apply.mutate(schedule.id, {
      onError: fail,
      onSettled: () => setDialog('none'),
    });
  };

  const submitCancel = (applicationId: string) => {
    setNotice(null);
    cancel.mutate(applicationId, {
      onError: fail,
      onSettled: () => setDialog('none'),
    });
  };

  const noticeAlert =
    notice === null ? null : (
      <FormAlert>
        {notice.message}
        {notice.myApplicationsLink ? (
          <>
            {' '}
            <Link href="/me/applications" className={linkClasses}>
              내 신청
            </Link>
          </>
        ) : null}
      </FormAlert>
    );

  switch (area.kind) {
    case 'admin':
      return <Message>{ADMIN_ACCOUNT_MESSAGE}</Message>;
    case 'loading':
      return <Loading />;
    case 'closed':
      return (
        <Message notice={noticeAlert}>{RECRUITMENT_CLOSED_MESSAGE}</Message>
      );
    case 'reapply-blocked':
      return <Message notice={noticeAlert}>{REAPPLY_BLOCKED_MESSAGE}</Message>;
    case 'birth-year':
      return (
        <Message notice={noticeAlert}>
          {birthYearRuleMessage(
            schedule.maleMinBirthYear,
            schedule.maleMaxBirthYear,
          )}
        </Message>
      );
    case 'full':
      return (
        <Message notice={noticeAlert}>{genderFullMessage(area.gender)}</Message>
      );
    case 'applied': {
      const { application } = area;
      return (
        <Area>
          {noticeAlert}
          <div className="flex items-center justify-between gap-3">
            <p className="text-base font-semibold text-ink">
              참가 신청이 접수되었습니다.
            </p>
            <Badge tone="warning">
              {APPLICATION_STATUS_LABELS[application.status]}
            </Badge>
          </div>
          <p className="text-sm text-ink tabular-nums">
            {formatFee(application.price)}
          </p>
          <p className="text-sm text-ink-soft">{PENDING_NOTE}</p>
          {area.cancellable ? (
            <Button
              variant="secondary"
              className="self-start"
              disabled={cancel.isPending}
              onClick={() => setDialog('cancel')}
            >
              신청 취소
            </Button>
          ) : (
            <p className="text-sm text-ink-soft">{NOT_CANCELLABLE_MESSAGE}</p>
          )}
          <ConfirmDialog
            open={dialog === 'cancel'}
            title="신청 취소"
            confirmLabel="신청 취소"
            pendingLabel="취소하는 중…"
            pending={cancel.isPending}
            onConfirm={() => submitCancel(application.id)}
            onClose={() => setDialog('none')}
          >
            {CANCEL_CONFIRM_MESSAGE}
          </ConfirmDialog>
        </Area>
      );
    }
    case 'apply':
      return (
        <Area>
          {noticeAlert}
          <Button disabled={apply.isPending} onClick={() => setDialog('apply')}>
            참가 신청
          </Button>
          <ConfirmDialog
            open={dialog === 'apply'}
            title="참가 신청"
            confirmLabel="신청"
            pendingLabel="신청하는 중…"
            pending={apply.isPending}
            onConfirm={submitApply}
            onClose={() => setDialog('none')}
          >
            {formatDateTime(schedule.startsAt)} 일정에 참가 신청할까요? 참가비는{' '}
            {formatWon(area.price)}입니다.
          </ConfirmDialog>
        </Area>
      );
  }
}

function Area({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="참가 신청"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6"
    >
      {children}
    </section>
  );
}

function Message({
  notice = null,
  children,
}: {
  notice?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Area>
      {notice}
      <p className="text-sm text-ink">{children}</p>
    </Area>
  );
}

function Loading() {
  return (
    <Area>
      <p role="status" className="text-sm text-ink-soft">
        불러오는 중…
      </p>
    </Area>
  );
}
