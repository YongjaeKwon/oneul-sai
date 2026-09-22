'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { API_ERROR_CODES } from '@oneul-sai/contracts';
import { Button } from '@oneul-sai/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { FormAlert } from '@/components/form-alert';
import { TextField } from '@/components/text-field';
import { useAuth } from '@/lib/auth';
import { describeError, isCredentialError, isSessionEnded } from '@/lib/errors';
import { useChangePassword } from '@/lib/queries';
import {
  PasswordChangeFormSchema,
  type PasswordChangeInput,
  type PasswordChangeOutput,
} from '@/lib/schemas';

const NEW_PASSWORD_RULE_MESSAGE =
  '새 비밀번호는 8자 이상 64자 이하로 입력해 주세요.';

/**
 * W5 비밀번호 변경(SPEC-001 4절). 204 뒤 현재 탭은 로그인 상태를 유지한다(요청에 실린 쿠키의 세션은 남는다).
 * 현재 비밀번호가 틀리면 로그인과 같은 실패 카운터 · 백오프가 적용되므로 버튼을 잠근 채 기다린다.
 */
export function PasswordForm() {
  const router = useRouter();
  const { endSession } = useAuth();
  const changePassword = useChangePassword();
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordChangeInput, unknown, PasswordChangeOutput>({
    resolver: zodResolver(PasswordChangeFormSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      newPasswordConfirm: '',
    },
  });

  const onSubmit = async ({
    currentPassword,
    newPassword,
  }: PasswordChangeOutput) => {
    setSubmitError(null);
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setDone(true);
    } catch (error) {
      if (isCredentialError(error)) {
        setError('currentPassword', {
          message: '현재 비밀번호가 맞지 않습니다.',
        });
        return;
      }
      if (isSessionEnded(error)) {
        endSession();
        return;
      }
      setSubmitError(
        describeError(error, {
          [API_ERROR_CODES.VALIDATION_FAILED]: NEW_PASSWORD_RULE_MESSAGE,
        }),
      );
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-6">
        <FormAlert tone="success">
          비밀번호를 바꿨습니다. 다른 기기에서는 다시 로그인해야 합니다.
        </FormAlert>
        <Button onClick={() => router.replace('/me')}>
          내 정보로 돌아가기
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
    >
      <fieldset disabled={isSubmitting} className="flex flex-col gap-5">
        <TextField
          label="현재 비밀번호"
          type="password"
          autoComplete="current-password"
          required
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />
        <TextField
          label="새 비밀번호"
          type="password"
          autoComplete="new-password"
          hint="8자 이상 64자 이하"
          required
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        <TextField
          label="새 비밀번호 확인"
          type="password"
          autoComplete="new-password"
          required
          error={errors.newPasswordConfirm?.message}
          {...register('newPasswordConfirm')}
        />
      </fieldset>

      {submitError !== null ? <FormAlert>{submitError}</FormAlert> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '바꾸는 중…' : '비밀번호 바꾸기'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => router.push('/me')}
          disabled={isSubmitting}
        >
          취소
        </Button>
      </div>
    </form>
  );
}
