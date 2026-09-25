'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { API_ERROR_CODES, GENDERS } from '@oneul-sai/contracts';
import { Button, FieldError } from '@oneul-sai/ui';
import Link from 'next/link';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { CheckboxField } from '@/components/checkbox-field';
import { FormAlert } from '@/components/form-alert';
import { TextField } from '@/components/text-field';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { describeError, isApiClientError } from '@/lib/errors';
import { GENDER_LABELS } from '@/lib/format';
import { withNext } from '@/lib/next-path';
import {
  SignupFormSchema,
  type SignupFormInput,
  type SignupFormOutput,
} from '@/lib/schemas';

interface SubmitFailure {
  message: string;
  /** 409(이미 가입) 또는 가입 뒤 로그인 실패 — 로그인 링크를 함께 보여 준다. */
  loginLink: boolean;
}

const linkClasses = 'font-medium text-ink underline underline-offset-4';

/** W1 가입(SPEC-001 4절). 201이면 바로 로그인해 로그인 상태로 내 프로필로 간다 — 이동은 `RedirectIfAuthenticated`가 한다. */
export function SignupForm({ next }: { next: string | null }) {
  const { login } = useAuth();
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const genderErrorId = useId();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormInput, unknown, SignupFormOutput>({
    resolver: zodResolver(SignupFormSchema),
    defaultValues: {
      email: '',
      password: '',
      name: '',
      phone: '',
      consents: { privacy: false, marketing: false },
    },
  });

  const onSubmit = async (values: SignupFormOutput) => {
    setFailure(null);
    try {
      await apiClient.signup(values);
    } catch (error) {
      setFailure({
        message: describeError(error),
        loginLink:
          isApiClientError(error) &&
          error.code === API_ERROR_CODES.EMAIL_ALREADY_EXISTS,
      });
      return;
    }
    try {
      await login({ email: values.email, password: values.password });
    } catch {
      setFailure({
        message: '가입은 완료되었습니다. 로그인해 주세요.',
        loginLink: true,
      });
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
          autoComplete="new-password"
          hint="8자 이상 64자 이하"
          required
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="이름"
          autoComplete="name"
          hint="행사 당일 신분증으로 이름과 출생연도를 확인합니다. 신분증과 같게 적어 주세요."
          required
          error={errors.name?.message}
          {...register('name')}
        />

        <fieldset aria-describedby={errors.gender ? genderErrorId : undefined}>
          <legend className="text-sm font-medium text-ink">
            성별
            <span className="ml-1 text-rose-ink" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> (필수)</span>
          </legend>
          <div className="mt-1.5 flex gap-3">
            {GENDERS.map((gender) => (
              <label
                key={gender}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-control border border-line bg-ivory px-4 py-2 text-base text-ink has-checked:border-rose has-checked:bg-rose-wash has-focus-visible:outline-2 has-focus-visible:outline-offset-0 has-focus-visible:outline-rose"
              >
                <input
                  type="radio"
                  value={gender}
                  className="accent-rose"
                  {...register('gender')}
                />
                {GENDER_LABELS[gender]}
              </label>
            ))}
          </div>
          <FieldError id={genderErrorId}>{errors.gender?.message}</FieldError>
        </fieldset>

        <TextField
          label="출생연도"
          type="number"
          inputMode="numeric"
          placeholder="예: 1995"
          required
          error={errors.birthYear?.message}
          {...register('birthYear', { valueAsNumber: true })}
        />
        <TextField
          label="휴대폰 번호"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="010-0000-0000"
          required
          error={errors.phone?.message}
          {...register('phone')}
        />

        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <CheckboxField
            label="개인정보 수집 · 이용에 동의합니다. (필수)"
            error={errors.consents?.privacy?.message}
            {...register('consents.privacy')}
          />
          <CheckboxField
            label="마케팅 정보 수신에 동의합니다. (선택)"
            hint="수신 거부는 내 프로필에서 언제든 할 수 있습니다."
            {...register('consents.marketing')}
          />
        </div>
      </fieldset>

      {failure !== null ? (
        <FormAlert>
          {failure.message}
          {failure.loginLink ? (
            <>
              {' '}
              <Link href={withNext('/login', next)} className={linkClasses}>
                로그인하기
              </Link>
            </>
          ) : null}
        </FormAlert>
      ) : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? '가입하는 중…' : '가입하기'}
      </Button>

      <p className="text-center text-sm text-ink-soft">
        이미 회원이신가요?{' '}
        <Link href={withNext('/login', next)} className={linkClasses}>
          로그인
        </Link>
      </p>
    </form>
  );
}
