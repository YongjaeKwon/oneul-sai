'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Dialog } from '@oneul-sai/ui';
import { useForm } from 'react-hook-form';
import { useState } from 'react';

import { FormAlert } from '@/components/form-alert';
import { TextField } from '@/components/text-field';
import { useAuth } from '@/lib/auth';
import { describeError, isCredentialError, isSessionEnded } from '@/lib/errors';
import {
  WithdrawFormSchema,
  type WithdrawFormInput,
  type WithdrawFormOutput,
} from '@/lib/schemas';

export interface WithdrawDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * W6 탈퇴 확인 모달(SPEC-001 4절). 비밀번호를 다시 입력받아 `DELETE /members/me`.
 * 204면 로그아웃 상태가 되고 `RequireAuth`가 홈으로 보낸다. 틀린 비밀번호는 로그인과 같은 백오프를 받으므로 버튼을 잠근 채 기다린다.
 */
export function WithdrawDialog({ open, onClose }: WithdrawDialogProps) {
  const { withdraw } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<WithdrawFormInput, unknown, WithdrawFormOutput>({
    resolver: zodResolver(WithdrawFormSchema),
    defaultValues: { password: '' },
  });

  const close = () => {
    reset();
    setSubmitError(null);
    onClose();
  };

  const onSubmit = async (values: WithdrawFormOutput) => {
    setSubmitError(null);
    try {
      await withdraw(values);
    } catch (error) {
      if (isCredentialError(error)) {
        setError('password', { message: '비밀번호가 맞지 않습니다.' });
        return;
      }
      // 세션 종료(401)는 AuthProvider가 처리한다.
      if (!isSessionEnded(error)) {
        setSubmitError(describeError(error));
      }
    }
  };

  return (
    <Dialog open={open} onClose={close} title="탈퇴">
      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <p className="text-sm text-ink-soft">
          탈퇴하면 다시 로그인할 수 없고, 이름 · 연락처 등 개인정보는 바로
          삭제됩니다. 자세한 내용은 개인정보 처리방침을 따릅니다.
        </p>
        <fieldset disabled={isSubmitting}>
          <TextField
            label="비밀번호"
            type="password"
            autoComplete="current-password"
            required
            error={errors.password?.message}
            {...register('password')}
          />
        </fieldset>
        {submitError !== null ? <FormAlert>{submitError}</FormAlert> : null}
        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? '처리하는 중…' : '탈퇴하기'}
          </Button>
          <Button variant="secondary" onClick={close} disabled={isSubmitting}>
            취소
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
