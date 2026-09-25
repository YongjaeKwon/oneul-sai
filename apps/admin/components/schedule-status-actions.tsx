'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  API_ERROR_CODES,
  CANCEL_REASON_MAX_LENGTH,
  UpdateScheduleStatusRequestSchema,
  type AdminSchedule,
  type UpdateScheduleStatusRequest,
} from '@oneul-sai/contracts';
import { Button, Dialog } from '@oneul-sai/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { useEndSessionOn401 } from '@/lib/auth-provider';
import { scheduleCancelApplicantsNote } from '@/lib/applications';
import { STATUS_TIME_INVALID_MESSAGE, describeEventError } from '@/lib/errors';
import { textareaClasses } from '@/lib/form-styles';
import {
  useDeleteSchedule,
  useRefreshSchedule,
  useUpdateScheduleStatus,
} from '@/lib/queries';
import { FormField } from './form-field';
import { Notice } from './notice';

const STATUS_ERROR_OVERRIDES = {
  [API_ERROR_CODES.SCHEDULE_TIME_INVALID]: STATUS_TIME_INVALID_MESSAGE,
};

/**
 * A8 상태 버튼(6절 전이 표): DRAFT 공개 · 취소 · 삭제, OPEN 모집 마감 · 취소, CLOSED 다시 열기(신청 마감 전에만) · 취소.
 * CANCELLED는 이 컴포넌트를 쓰지 않는다(읽기 전용). `now`는 회차를 불러온 시각.
 */
export function ScheduleStatusActions({
  schedule,
  now,
}: {
  schedule: AdminSchedule;
  now: number;
}) {
  const router = useRouter();
  const refreshSchedule = useRefreshSchedule(schedule.meetupId);
  const statusMutation = useUpdateScheduleStatus(
    schedule.meetupId,
    schedule.id,
  );
  const deleteMutation = useDeleteSchedule(schedule.meetupId, schedule.id);
  useEndSessionOn401(statusMutation.error ?? deleteMutation.error);
  const [dialog, setDialog] = useState<'cancel' | 'delete' | null>(null);
  const deleteQuestionId = useId();
  const applicantsNote = scheduleCancelApplicantsNote(schedule);

  const cancelForm = useForm<UpdateScheduleStatusRequest>({
    resolver: zodResolver(UpdateScheduleStatusRequestSchema),
    defaultValues: { status: 'CANCELLED', cancelReason: '' },
  });

  const busy = statusMutation.isPending || deleteMutation.isPending;
  const deadlinePassed = Date.parse(schedule.applyDeadlineAt) <= now;

  const closeDialog = () => {
    cancelForm.reset();
    setDialog(null);
  };

  const onCancel = cancelForm.handleSubmit((values) => {
    deleteMutation.reset();
    statusMutation.mutate(values, { onSuccess: closeDialog });
  });

  const changeStatus = (status: 'OPEN' | 'CLOSED') => {
    deleteMutation.reset();
    statusMutation.mutate({ status });
  };

  const error = statusMutation.error ?? deleteMutation.error;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {schedule.status === 'DRAFT' ? (
          <Button disabled={busy} onClick={() => changeStatus('OPEN')}>
            공개
          </Button>
        ) : null}
        {schedule.status === 'OPEN' ? (
          <Button disabled={busy} onClick={() => changeStatus('CLOSED')}>
            모집 마감
          </Button>
        ) : null}
        {schedule.status === 'CLOSED' ? (
          <Button
            disabled={busy || deadlinePassed}
            onClick={() => changeStatus('OPEN')}
          >
            다시 열기
          </Button>
        ) : null}
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            // 앞서 실패한 공개 · 마감의 에러가 취소 창 안에 따라오지 않게
            statusMutation.reset();
            // 창의 "신청 N건도 함께 취소됩니다"가 화면을 연 뒤 들어온 신청까지 세도록 회차를 새로 읽는다(실패하면 가진 값)
            void refreshSchedule(schedule.id);
            setDialog('cancel');
          }}
        >
          취소
        </Button>
        {schedule.status === 'DRAFT' ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setDialog('delete')}
          >
            삭제
          </Button>
        ) : null}
      </div>
      {schedule.status === 'DRAFT' ? (
        <p className="text-xs text-ink-soft">
          공개하면 참가자 일정 화면에 30초 안에 보입니다. 공개한 적 없는 회차만
          삭제할 수 있습니다.
        </p>
      ) : null}
      {schedule.status === 'CLOSED' && deadlinePassed ? (
        <p className="text-xs text-ink-soft">
          신청 마감이 지나 다시 열 수 없습니다. 신청 마감을 바꾼 뒤 다시 눌러
          주세요.
        </p>
      ) : null}
      {error ? (
        <Notice tone="danger">
          {describeEventError(error, STATUS_ERROR_OVERRIDES)}
        </Notice>
      ) : null}

      <Dialog
        open={dialog === 'cancel'}
        title="회차 취소"
        onClose={closeDialog}
      >
        <form onSubmit={onCancel} noValidate className="flex flex-col gap-4">
          <p>
            취소한 회차는 참가자 화면에서 사라지고 되돌릴 수 없습니다.
            {/* SPEC-003 I — 활성 신청도 같은 트랜잭션에서 취소된다 */}
            {applicantsNote === null ? null : ` ${applicantsNote}`}
          </p>
          <FormField
            label="취소 사유"
            required
            help="운영자 화면에만 보입니다."
            error={cancelForm.formState.errors.cancelReason?.message}
          >
            {({ invalid, ...control }) => (
              <textarea
                {...control}
                rows={3}
                maxLength={CANCEL_REASON_MAX_LENGTH}
                placeholder={`${CANCEL_REASON_MAX_LENGTH}자 이하`}
                aria-invalid={invalid || undefined}
                className={textareaClasses}
                disabled={statusMutation.isPending}
                {...cancelForm.register('cancelReason')}
              />
            )}
          </FormField>
          {statusMutation.error ? (
            <Notice tone="danger">
              {describeEventError(statusMutation.error, STATUS_ERROR_OVERRIDES)}
            </Notice>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={statusMutation.isPending}>
              {statusMutation.isPending ? '처리 중…' : '회차 취소'}
            </Button>
            <Button
              variant="ghost"
              disabled={statusMutation.isPending}
              onClick={closeDialog}
            >
              닫기
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={dialog === 'delete'}
        title="회차 삭제"
        onClose={closeDialog}
        describedBy={deleteQuestionId}
      >
        <p id={deleteQuestionId}>
          이 회차를 삭제할까요? 삭제하면 되돌릴 수 없습니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={deleteMutation.isPending}
            onClick={() => {
              statusMutation.reset();
              deleteMutation.mutate(undefined, {
                onSuccess: () =>
                  router.replace(`/meetups/${schedule.meetupId}`),
                onSettled: closeDialog,
              });
            }}
          >
            {deleteMutation.isPending ? '처리 중…' : '삭제'}
          </Button>
          {/* 처음 포커스는 "닫기" — Enter 한 번에 삭제되지 않게. `autoFocus`는 showModal() 뒤에 남지 않아 Dialog가 data-autofocus로 옮긴다.
              취소 창은 첫 칸인 사유 입력(textarea — Enter는 줄바꿈)에서 시작해 바로 제출되지 않는다 */}
          <Button
            variant="ghost"
            data-autofocus
            disabled={deleteMutation.isPending}
            onClick={closeDialog}
          >
            닫기
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
