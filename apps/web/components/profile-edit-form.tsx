'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { MemberProfile } from '@oneul-sai/contracts';
import { Button } from '@oneul-sai/ui';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { CheckboxField } from '@/components/checkbox-field';
import { FormAlert } from '@/components/form-alert';
import { TextField } from '@/components/text-field';
import { useAuth } from '@/lib/auth';
import { describeError, isCredentialError, isSessionEnded } from '@/lib/errors';
import {
  EMPTY,
  formatBirthYear,
  formatPhone,
  GENDER_LABELS,
} from '@/lib/format';
import { useUpdateMe } from '@/lib/queries';
import {
  createProfileEditSchema,
  toUpdateMyProfileRequest,
  type ProfileEditInput,
  type ProfileEditOutput,
} from '@/lib/schemas';

export interface ProfileEditFormProps {
  profile: MemberProfile;
  onCancel: () => void;
  onSaved: () => void;
}

/**
 * W4 프로필 수정(SPEC-001 4절). 휴대폰 · 마케팅 수신 동의만 바꿀 수 있고, 휴대폰을 바꿀 때는 현재 비밀번호를 함께 보낸다(D9).
 * 이름 · 성별 · 출생연도는 신분증 대조 항목이라 잠근다(D11).
 */
export function ProfileEditForm({
  profile,
  onCancel,
  onSaved,
}: ProfileEditFormProps) {
  const { endSession } = useAuth();
  const updateMe = useUpdateMe();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const resolver = useMemo(
    () => zodResolver(createProfileEditSchema(profile)),
    [profile],
  );
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileEditInput, unknown, ProfileEditOutput>({
    resolver,
    defaultValues: {
      phone: profile.phone === null ? '' : formatPhone(profile.phone),
      marketingConsent: profile.marketingConsent,
      currentPassword: '',
    },
  });

  const onSubmit = async (values: ProfileEditOutput) => {
    setSubmitError(null);
    const request = toUpdateMyProfileRequest(values, profile);
    if (request === null) {
      setSubmitError('바꿀 항목이 없습니다.');
      return;
    }
    try {
      await updateMe.mutateAsync(request);
      onSaved();
    } catch (error) {
      if (isCredentialError(error)) {
        setError('currentPassword', { message: '비밀번호가 맞지 않습니다.' });
        return;
      }
      if (isSessionEnded(error)) {
        endSession();
        return;
      }
      setSubmitError(describeError(error));
    }
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
    >
      <div className="rounded-card border border-line bg-surface p-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-soft">이메일</dt>
          <dd className="text-ink break-all">{profile.email}</dd>
          <dt className="text-ink-soft">이름</dt>
          <dd className="text-ink">{profile.name}</dd>
          <dt className="text-ink-soft">성별</dt>
          <dd className="text-ink">
            {profile.gender === null ? EMPTY : GENDER_LABELS[profile.gender]}
          </dd>
          <dt className="text-ink-soft">출생연도</dt>
          <dd className="text-ink tabular-nums">
            {formatBirthYear(profile.birthYear)}
          </dd>
        </dl>
        <p className="mt-3 text-xs text-ink-muted">
          이름 · 성별 · 출생연도 변경은 오늘사이에 문의해 주세요.
        </p>
      </div>

      <fieldset disabled={isSubmitting} className="flex flex-col gap-5">
        <TextField
          label="휴대폰 번호"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <CheckboxField
          label="마케팅 정보 수신에 동의합니다."
          hint="선택 사항입니다. 언제든 바꿀 수 있습니다."
          {...register('marketingConsent')}
        />
        <TextField
          label="현재 비밀번호"
          type="password"
          autoComplete="current-password"
          hint="휴대폰 번호를 바꿀 때만 입력합니다."
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />
      </fieldset>

      {submitError !== null ? <FormAlert>{submitError}</FormAlert> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '저장하는 중…' : '저장'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          취소
        </Button>
      </div>
    </form>
  );
}
