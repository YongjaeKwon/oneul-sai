'use client';

import type { MyApplication } from '@oneul-sai/contracts';
import { Badge, Button } from '@oneul-sai/ui';
import Link from 'next/link';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormAlert } from '@/components/form-alert';
import { LoadingBlock } from '@/components/loading-block';
import {
  canCancelMine,
  CANCEL_CONFIRM_MESSAGE,
  describeApplicationError,
  NOT_CANCELLABLE_MESSAGE,
  PENDING_NOTE,
} from '@/lib/applications';
import { useAuth, useEndSessionOn401 } from '@/lib/auth';
import { describeError, isSessionEnded } from '@/lib/errors';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  CANCELLED_BY_NOTES,
  formatDateTime,
  formatFee,
} from '@/lib/format';
import { useCancelMyApplication, useMyApplications } from '@/lib/queries';

const linkClasses =
  'rounded-control px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-rose-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose';

interface Failure {
  applicationId: string;
  message: string;
}

/** W10 내 신청(SPEC-003 4절). 최근 신청 먼저 20개씩. 로그인 확인은 `/me` 레이아웃이 한다. */
export function MyApplicationsScreen({ page }: { page: number }) {
  const { endSession } = useAuth();
  const { data, error } = useMyApplications({ page }, true);
  useEndSessionOn401(error);
  const cancel = useCancelMyApplication();
  const [target, setTarget] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  if (error !== null) {
    return isSessionEnded(error) ? null : (
      <FormAlert>{describeError(error)}</FormAlert>
    );
  }
  if (data === undefined) {
    return <LoadingBlock />;
  }

  if (data.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-sm text-ink-soft">아직 신청한 일정이 없습니다.</p>
        <Link href="/events" className={linkClasses}>
          다가오는 일정 보기
        </Link>
      </div>
    );
  }

  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));

  const confirmCancel = (applicationId: string) => {
    setFailure(null);
    cancel.mutate(applicationId, {
      onError: (caught) => {
        if (isSessionEnded(caught)) {
          endSession();
          return;
        }
        setFailure({
          applicationId,
          message: describeApplicationError(caught),
        });
      },
      onSettled: () => setTarget(null),
    });
  };

  return (
    <>
      <ul className="flex flex-col gap-4">
        {data.items.map((application) => (
          <li key={application.id}>
            <ApplicationCard
              application={application}
              failure={
                failure?.applicationId === application.id
                  ? failure.message
                  : null
              }
              cancelDisabled={cancel.isPending}
              onCancel={() => setTarget(application.id)}
            />
          </li>
        ))}
      </ul>

      {data.page > 1 || data.page < lastPage ? (
        <nav aria-label="페이지" className="flex justify-between">
          {data.page > 1 ? (
            <Link
              href={`/me/applications?page=${data.page - 1}`}
              className={linkClasses}
            >
              이전
            </Link>
          ) : (
            <span />
          )}
          {data.page < lastPage ? (
            <Link
              href={`/me/applications?page=${data.page + 1}`}
              className={linkClasses}
            >
              다음
            </Link>
          ) : null}
        </nav>
      ) : null}

      <ConfirmDialog
        open={target !== null}
        title="신청 취소"
        confirmLabel="신청 취소"
        pendingLabel="취소하는 중…"
        pending={cancel.isPending}
        onConfirm={() => {
          if (target !== null) {
            confirmCancel(target);
          }
        }}
        onClose={() => setTarget(null)}
      >
        {CANCEL_CONFIRM_MESSAGE}
      </ConfirmDialog>
    </>
  );
}

function ApplicationCard({
  application,
  failure,
  cancelDisabled,
  onCancel,
}: {
  application: MyApplication;
  failure: string | null;
  cancelDisabled: boolean;
  onCancel: () => void;
}) {
  const { schedule } = application;
  // 공개 중인 일정만 상세로 잇는다 — 취소된 일정의 공개 상세는 404다.
  const isPublic = schedule.status === 'OPEN' || schedule.status === 'CLOSED';

  return (
    <article className="flex flex-col gap-2 rounded-card border border-line bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-lg font-semibold text-ink tabular-nums">
          {formatDateTime(schedule.startsAt)}
        </p>
        <Badge tone={APPLICATION_STATUS_TONES[application.status]}>
          {APPLICATION_STATUS_LABELS[application.status]}
        </Badge>
      </div>
      <h2 className="text-base font-semibold text-ink">
        {isPublic ? (
          <Link
            href={`/events/${application.scheduleId}`}
            className="rounded-control underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose"
          >
            {schedule.title}
          </Link>
        ) : (
          schedule.title
        )}
      </h2>
      <p className="text-sm text-ink-soft">{schedule.venueArea}</p>
      <p className="text-sm text-ink tabular-nums">
        {formatFee(application.price)}
      </p>
      <p className="text-sm text-ink-soft">
        {application.cancelledBy === null
          ? PENDING_NOTE
          : CANCELLED_BY_NOTES[application.cancelledBy]}
      </p>
      {application.status === 'PENDING' ? (
        canCancelMine(application) ? (
          <Button
            variant="secondary"
            className="mt-2 self-start"
            disabled={cancelDisabled}
            onClick={onCancel}
          >
            신청 취소
          </Button>
        ) : (
          <p className="text-sm text-ink-soft">{NOT_CANCELLABLE_MESSAGE}</p>
        )
      ) : null}
      {failure !== null ? <FormAlert>{failure}</FormAlert> : null}
    </article>
  );
}
