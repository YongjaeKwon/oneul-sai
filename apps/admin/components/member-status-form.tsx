'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  STATUS_REASON_MAX_LENGTH,
  UpdateMemberStatusRequestSchema,
  type MemberDetail,
  type UpdateMemberStatusRequest,
} from '@oneul-sai/contracts';
import { Button, FieldError, Label } from '@oneul-sai/ui';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { useEndSessionOn401 } from '@/lib/auth-provider';
import { describeError } from '@/lib/errors';
import { textareaClasses } from '@/lib/form-styles';
import { useUpdateMemberStatus } from '@/lib/queries';
import { Notice } from './notice';

type ChangeableStatus = UpdateMemberStatusRequest['status'];

export interface MemberStatusFormProps {
  memberId: string;
  /** 지금 상태. 탈퇴(WITHDRAWN) 회원은 이 폼을 쓰지 않는다. */
  currentStatus: ChangeableStatus;
  onUpdated: (detail: MemberDetail) => void;
}

const COPY: Record<
  ChangeableStatus,
  { action: string; explain: string; confirm: string; submit: string }
> = {
  // 목표 상태 기준. SUSPENDED = "정지", ACTIVE = "정지 해제".
  SUSPENDED: {
    action: '정지',
    explain:
      '정지하면 이 회원의 모든 세션이 바로 끊기고, 정지를 해제할 때까지 로그인할 수 없습니다.',
    confirm:
      '정말 정지할까요? 정지 즉시 이 회원의 모든 기기에서 로그아웃되며, 사유는 상세 화면에 남습니다.',
    submit: '정지 확정',
  },
  ACTIVE: {
    action: '정지 해제',
    explain: '정지를 해제하면 이 회원이 다시 로그인할 수 있습니다.',
    confirm:
      '정지를 해제할까요? 해제 뒤에는 이 회원이 바로 로그인할 수 있습니다.',
    submit: '정지 해제 확정',
  },
};

/**
 * A3 계정 상태 변경 — "정지" 또는 "정지 해제" 버튼 → 사유 입력 + 확인 → `PATCH /api/v1/members/:id/status`.
 * 정지 사유는 필수(200자 이하), 해제 사유는 선택이다(`UpdateMemberStatusRequestSchema`).
 */
export function MemberStatusForm({
  memberId,
  currentStatus,
  onUpdated,
}: MemberStatusFormProps) {
  const target: ChangeableStatus =
    currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  const copy = COPY[target];
  const reasonId = useId();
  const reasonErrorId = useId();
  const [open, setOpen] = useState(false);

  const mutation = useUpdateMemberStatus(memberId);
  useEndSessionOn401(mutation.error);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateMemberStatusRequest>({
    resolver: zodResolver(UpdateMemberStatusRequestSchema),
    defaultValues: { status: target, reason: '' },
  });

  const close = () => {
    reset();
    mutation.reset();
    setOpen(false);
  };

  const onSubmit = handleSubmit((values) => {
    mutation.mutate(
      {
        status: values.status,
        // 해제 사유가 비어 있으면 필드 자체를 보내지 않는다(strict 스키마, 빈 문자열 저장 방지).
        reason:
          values.reason !== undefined && values.reason.length > 0
            ? values.reason
            : undefined,
      },
      {
        onSuccess: (detail) => {
          setOpen(false);
          onUpdated(detail);
        },
      },
    );
  });

  if (!open) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-soft">{copy.explain}</p>
        <div>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {copy.action}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4"
      aria-busy={mutation.isPending}
    >
      <input type="hidden" {...register('status')} />
      <Notice tone={target === 'SUSPENDED' ? 'danger' : 'info'}>
        {copy.confirm}
      </Notice>
      <div>
        <Label htmlFor={reasonId} required={target === 'SUSPENDED'}>
          사유
        </Label>
        <textarea
          id={reasonId}
          rows={3}
          maxLength={STATUS_REASON_MAX_LENGTH}
          placeholder={
            target === 'SUSPENDED'
              ? '정지 사유를 적어 주세요. (200자 이하)'
              : '해제 사유가 있으면 적어 주세요. (선택, 200자 이하)'
          }
          className={`${textareaClasses} mt-1.5`}
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={errors.reason ? reasonErrorId : undefined}
          disabled={mutation.isPending}
          {...register('reason')}
        />
        <FieldError id={reasonErrorId}>{errors.reason?.message}</FieldError>
      </div>
      {mutation.error ? (
        <Notice tone="danger">{describeError(mutation.error)}</Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? '처리 중…' : copy.submit}
        </Button>
        <Button variant="ghost" onClick={close} disabled={mutation.isPending}>
          취소
        </Button>
      </div>
    </form>
  );
}
