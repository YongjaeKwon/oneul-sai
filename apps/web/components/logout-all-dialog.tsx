'use client';

import { Button, Dialog } from '@oneul-sai/ui';
import { useId, useState } from 'react';

import { FormAlert } from '@/components/form-alert';
import { useAuth } from '@/lib/auth';
import { describeError, isSessionEnded } from '@/lib/errors';

export interface LogoutAllDialogProps {
  open: boolean;
  onClose: () => void;
}

/** 모든 기기에서 로그아웃 확인 모달(SPEC-001 4절 8번, D8). 204면 로그아웃 상태가 되고 `RequireAuth`가 홈으로 보낸다. */
export function LogoutAllDialog({ open, onClose }: LogoutAllDialogProps) {
  const { logoutAll } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const questionId = useId();

  const close = () => {
    setError(null);
    onClose();
  };

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await logoutAll();
    } catch (caught) {
      // 세션 종료(401)는 AuthProvider가 처리한다.
      if (!isSessionEnded(caught)) {
        setError(describeError(caught));
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="모든 기기에서 로그아웃"
      describedBy={questionId}
    >
      <p id={questionId} className="text-sm text-ink-soft">
        다른 기기 · 브라우저의 로그인도 모두 끊깁니다.
      </p>
      {error !== null ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex justify-end gap-2">
        <Button onClick={() => void confirm()} disabled={pending}>
          {pending ? '처리하는 중…' : '모두 로그아웃'}
        </Button>
        <Button
          variant="secondary"
          data-autofocus
          onClick={close}
          disabled={pending}
        >
          취소
        </Button>
      </div>
    </Dialog>
  );
}
