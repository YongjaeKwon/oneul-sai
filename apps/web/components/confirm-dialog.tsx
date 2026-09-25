'use client';

import { Button, Dialog } from '@oneul-sai/ui';
import type { ReactNode } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 묻기만 하는 확인 창(참가 신청 · 신청 취소, SPEC-003 4절). 처음 포커스는 "닫기" — Enter 한 번에 신청 · 취소되지 않게
 * (디자인 파운데이션 5절). 제출 중에는 두 버튼을 막는다.
 */
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  pendingLabel,
  pending,
  onConfirm,
  onClose,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <p>{children}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button disabled={pending} onClick={onConfirm}>
          {pending ? pendingLabel : confirmLabel}
        </Button>
        <Button
          variant="secondary"
          data-autofocus
          disabled={pending}
          onClick={onClose}
        >
          닫기
        </Button>
      </div>
    </Dialog>
  );
}
