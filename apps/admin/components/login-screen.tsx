'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { API_ERROR_CODES, LoginRequestSchema } from '@oneul-sai/contracts';
import {
  BrandMark,
  Button,
  Divider,
  FieldError,
  Input,
  Label,
} from '@oneul-sai/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { NotAdminError, useAuth } from '@/lib/auth-provider';
import { describeError } from '@/lib/errors';
import { Notice } from './notice';
import { ScreenLoading } from './screen-loading';

/** A1 로그인 폼 값. `client: 'ADMIN'`은 api-client가 채운다(R1). */
const LoginFormSchema = LoginRequestSchema.omit({ client: true });
type LoginFormValues = z.infer<typeof LoginFormSchema>;

const DEFAULT_NEXT = '/members';

/** 로그인 뒤 돌아갈 경로. 이 사이트 안의 절대 경로만 허용한다(열린 리다이렉트 방지). */
function safeNextPath(value: string | null): string {
  if (value === null || !value.startsWith('/') || value.startsWith('//')) {
    return DEFAULT_NEXT;
  }
  return value;
}

const LOGIN_ERROR_OVERRIDES = {
  [API_ERROR_CODES.VALIDATION_FAILED]: '이메일과 비밀번호를 확인해 주세요.',
} as const;

/** A1 운영자 로그인. 역할이 ADMIN이 아니면 세션을 남기지 않고 "운영자 계정이 아닙니다."를 보여 준다. */
export function LoginScreen() {
  const { status, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));

  const emailId = useId();
  const emailErrorId = useId();
  const passwordId = useId();
  const passwordErrorId = useId();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  // 이미 로그인돼 있거나(새로 고침 뒤 부팅 refresh 성공) 방금 로그인했으면 목록으로.
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(nextPath);
    }
  }, [status, router, nextPath]);

  if (status !== 'anonymous') {
    return <ScreenLoading />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
    } catch (error) {
      setFormError(
        error instanceof NotAdminError
          ? error.message
          : describeError(error, LOGIN_ERROR_OVERRIDES),
      );
    }
  });

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface px-6 py-8 sm:px-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark size={32} />
          <h1 className="text-2xl font-semibold text-ink">오늘사이 관리자</h1>
          <p className="text-sm text-ink-soft">
            운영자 계정으로 로그인해 주세요.
          </p>
        </div>
        <Divider variant="accent" className="my-6" />
        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-5"
          aria-busy={isSubmitting}
        >
          <div>
            <Label htmlFor={emailId} required>
              이메일
            </Label>
            <Input
              id={emailId}
              type="email"
              autoComplete="username"
              inputMode="email"
              className="mt-1.5"
              invalid={errors.email !== undefined}
              aria-describedby={errors.email ? emailErrorId : undefined}
              {...register('email')}
            />
            <FieldError id={emailErrorId}>{errors.email?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor={passwordId} required>
              비밀번호
            </Label>
            <Input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              className="mt-1.5"
              invalid={errors.password !== undefined}
              aria-describedby={errors.password ? passwordErrorId : undefined}
              {...register('password')}
            />
            <FieldError id={passwordErrorId}>
              {errors.password?.message}
            </FieldError>
          </div>
          {formError !== null ? (
            <Notice tone="danger">{formError}</Notice>
          ) : null}
          {/* 백오프(SPEC-001 12절)로 응답이 최대 30초 늦어질 수 있다 — 버튼을 잠근 채 기다린다. */}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? '확인 중…' : '로그인'}
          </Button>
          {isSubmitting ? (
            <p className="text-center text-xs text-ink-soft" role="status">
              확인하고 있습니다. 잠시만 기다려 주세요.
            </p>
          ) : null}
        </form>
      </div>
    </main>
  );
}
