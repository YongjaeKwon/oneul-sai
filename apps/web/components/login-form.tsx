'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@oneul-sai/ui';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { FormAlert } from '@/components/form-alert';
import { TextField } from '@/components/text-field';
import { useAuth } from '@/lib/auth';
import { describeError } from '@/lib/errors';
import { withNext } from '@/lib/next-path';
import {
  LoginFormSchema,
  type LoginFormInput,
  type LoginFormOutput,
} from '@/lib/schemas';

/**
 * W2 로그인(SPEC-001 4절). 실패 문구는 하나다. 다섯 번째 시도부터는 응답이 늦어지므로(백오프, 최대 30초)
 * 버튼을 비활성화한 채 응답을 기다린다. 성공 시 이동은 `RedirectIfAuthenticated`가 한다.
 */
export function LoginForm({ next }: { next: string | null }) {
  const { login } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInput, unknown, LoginFormOutput>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormOutput) => {
    setSubmitError(null);
    try {
      await login(values);
    } catch (error) {
      setSubmitError(describeError(error));
    }
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
    >
      <fieldset disabled={isSubmitting} className="flex flex-col gap-5">
        <TextField
          label="이메일"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          error={errors.email?.message}
          {...register('email')}
        />
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

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? '로그인하는 중…' : '로그인'}
      </Button>
      {isSubmitting ? (
        <p role="status" className="text-center text-xs text-ink-soft">
          확인하는 동안 잠시 기다려 주세요.
        </p>
      ) : null}

      <p className="text-center text-sm text-ink-soft">
        아직 회원이 아니신가요?{' '}
        <Link
          href={withNext('/signup', next)}
          className="font-medium text-ink underline underline-offset-4"
        >
          가입하기
        </Link>
      </p>
    </form>
  );
}
