'use client';

import { API_ERROR_CODES, type PublicSchedule } from '@oneul-sai/contracts';
import { Badge, Button } from '@oneul-sai/ui';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormAlert } from '@/components/form-alert';
import { DEPOSIT_ACCOUNT } from '@/lib/api';
import {
  ADMIN_ACCOUNT_MESSAGE,
  applicationCard,
  applyAreaState,
  CANCEL_CONFIRM_MESSAGE,
  depositAccountNote,
  describeApplicationError,
  RECRUITMENT_CLOSED_MESSAGE,
  REAPPLY_BLOCKED_MESSAGE,
  type ApplyAreaState,
} from '@/lib/applications';
import { useAuth, useEndSessionOn401 } from '@/lib/auth';
import { describeError, isApiClientError, isSessionEnded } from '@/lib/errors';
import { formatDateTime, formatFee, formatWon } from '@/lib/format';
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
 * W9 일정 상세의 참가 신청 영역(SPEC-003 4절 · SPEC-004 4절). 신청 데이터는 서버 렌더에 들어가지 않는다 — 여기서 TanStack Query로 부른다.
 * (a) 지난 일정은 페이지가 이 영역을 두지 않는다. 판정은 `applyAreaState`, (e) 카드 내용은 `applicationCard`, 문구는 4절 표.
 * 영역은 한 `<section aria-live="polite">`로 유지해 신청 · 취소 결과로 바뀐 문구가 스크린 리더에 읽힌다. 확인 창은 그 밖에 둔다.
 */
export function ApplyArea({ schedule }: { schedule: PublicSchedule }) {
  const { state: auth, endSession } = useAuth();
  const me = useMe();
  // 운영자 계정은 `/api/v1/applications`가 403이라 부르지 않는다(d).
  const mine = useMyApplications(
    { scheduleId: schedule.id },
    me.data?.role === 'MEMBER',
  );
  const loadError = me.error ?? mine.error;
  useEndSessionOn401(loadError);
  const apply = useApply();
  const cancel = useCancelMyApplication();
  const [dialog, setDialog] = useState<'none' | 'apply' | 'cancel'>('none');
  const [notice, setNotice] = useState<Notice | null>(null);

  let area: ApplyAreaState | null = null;
  let body: ReactNode;
  if (auth.status === 'anonymous') {
    body = (
      <>
        <p className="text-sm text-ink">
          참가 신청은 로그인한 뒤 할 수 있습니다.
        </p>
        <Link
          href={`/login?next=/events/${schedule.id}`}
          className={`self-start ${linkClasses}`}
        >
          로그인
        </Link>
      </>
    );
  } else if (loadError !== null && !isSessionEnded(loadError)) {
    body = <FormAlert>{describeError(loadError)}</FormAlert>;
  } else if (me.data === undefined) {
    body = <Loading />;
  } else {
    area = applyAreaState(schedule, me.data, mine.data?.items);
    body = renderState(area);
  }

  function renderState(state: ApplyAreaState): ReactNode {
    switch (state.kind) {
      case 'admin':
        return <Message>{ADMIN_ACCOUNT_MESSAGE}</Message>;
      case 'loading':
        return <Loading />;
      case 'closed':
        return withNotice(<Message>{RECRUITMENT_CLOSED_MESSAGE}</Message>, [
          RECRUITMENT_CLOSED_MESSAGE,
        ]);
      case 'reapply-blocked':
        return withNotice(<Message>{REAPPLY_BLOCKED_MESSAGE}</Message>, [
          REAPPLY_BLOCKED_MESSAGE,
        ]);
      case 'applied': {
        // 접수 · 입금 대기 · 참가 확정 카드 — 제목 · 배지 · 안내 · 취소 가능 여부를 상태로 고른다(SPEC-004 13절 목록 7)
        const card = applicationCard(state.application);
        const account = depositAccountNote(state.application, DEPOSIT_ACCOUNT);
        return withNotice(
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-semibold text-ink">{card.title}</p>
              <Badge tone={card.tone}>{card.label}</Badge>
            </div>
            <p className="text-sm text-ink tabular-nums">
              {formatFee(state.application.price)}
            </p>
            <p className="text-sm text-ink-soft">{card.note}</p>
            {account !== null ? (
              <p className="text-sm text-ink tabular-nums">{account}</p>
            ) : null}
            {card.cancellable ? (
              <Button
                variant="secondary"
                className="self-start"
                disabled={cancel.isPending}
                onClick={() => setDialog('cancel')}
              >
                신청 취소
              </Button>
            ) : card.cancelBlocked !== null ? (
              <p className="text-sm text-ink-soft">{card.cancelBlocked}</p>
            ) : null}
          </>,
          card.cancelBlocked === null ? [] : [card.cancelBlocked],
        );
      }
      case 'apply':
        return withNotice(
          <Button disabled={apply.isPending} onClick={() => setDialog('apply')}>
            참가 신청
          </Button>,
          [],
        );
    }
  }

  /** 오류 알림을 위에 얹는다. 바뀐 상태가 같은 문장을 이미 보이면 두 번 보이지 않게 뺀다. */
  function withNotice(content: ReactNode, shown: readonly string[]) {
    return (
      <>
        {notice !== null && !shown.includes(notice.message) ? (
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
        ) : null}
        {content}
      </>
    );
  }

  const applied = area?.kind === 'applied' ? area : null;
  const applying = area?.kind === 'apply' ? area : null;

  const fail = (error: unknown) => {
    if (isSessionEnded(error)) {
      endSession();
      return;
    }
    // 409 `APPLICATION_CONFIRMED` · `ALREADY_APPLIED` 등은 onSettled의 무효화로 내 신청을 다시 불러와 (e)를 보인다
    setNotice({
      message: describeApplicationError(error),
      myApplicationsLink:
        isApiClientError(error) &&
        error.code === API_ERROR_CODES.PENDING_APPLICATION_LIMIT,
    });
  };

  return (
    <>
      <section
        aria-label="참가 신청"
        aria-live="polite"
        className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6"
      >
        {body}
      </section>

      {applied !== null ? (
        <ConfirmDialog
          open={dialog === 'cancel'}
          title="신청 취소"
          confirmLabel="신청 취소"
          pendingLabel="취소하는 중…"
          pending={cancel.isPending}
          onConfirm={() => {
            setNotice(null);
            cancel.mutate(applied.application.id, {
              onError: fail,
              onSettled: () => setDialog('none'),
            });
          }}
          onClose={() => setDialog('none')}
        >
          {CANCEL_CONFIRM_MESSAGE}
        </ConfirmDialog>
      ) : null}
      {applying !== null ? (
        <ConfirmDialog
          open={dialog === 'apply'}
          title="참가 신청"
          confirmLabel="신청"
          pendingLabel="신청하는 중…"
          pending={apply.isPending}
          onConfirm={() => {
            setNotice(null);
            apply.mutate(schedule.id, {
              onError: fail,
              onSettled: () => setDialog('none'),
            });
          }}
          onClose={() => setDialog('none')}
        >
          {formatDateTime(schedule.startsAt)} 일정에 참가 신청할까요? 참가비는{' '}
          {formatWon(applying.price)}입니다.
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function Message({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink">{children}</p>;
}

function Loading() {
  return (
    <p role="status" className="text-sm text-ink-soft">
      불러오는 중…
    </p>
  );
}
