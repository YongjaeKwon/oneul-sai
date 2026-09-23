'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateMeetupRequestSchema,
  DESCRIPTION_MAX_LENGTH,
  MEETUP_TITLE_MAX_LENGTH,
  type CreateMeetupRequest,
  type Meetup,
  type UpdateMeetupRequest,
} from '@oneul-sai/contracts';
import { Button, Input } from '@oneul-sai/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { useEndSessionOn401 } from '@/lib/auth-provider';
import { describeEventError } from '@/lib/errors';
import { textareaClasses } from '@/lib/form-styles';
import { useCreateMeetup, useUpdateMeetup } from '@/lib/queries';
import { FormField } from './form-field';
import { Notice } from './notice';

type MeetupFormInput = z.input<typeof CreateMeetupRequestSchema>;

/** 참가자에게 그대로 공개되는 칸의 안내(SPEC-002 4절 A5 · 12절 "운영자 실수로 새는 경로"). */
const PUBLIC_FIELDS_NOTICE =
  '제목과 설명은 참가자 일정 화면에 그대로 보입니다. 정확한 장소나 내부 메모는 적지 말아 주세요.';

/** A6 상품 수정 본문: 바꾼 필드만. */
function meetupChanges(
  values: CreateMeetupRequest,
  meetup: Meetup,
): UpdateMeetupRequest {
  const changes: UpdateMeetupRequest = {};
  if (values.title !== meetup.title) {
    changes.title = values.title;
  }
  const description = values.description ?? '';
  if (description !== meetup.description) {
    changes.description = description;
  }
  return changes;
}

/**
 * A5 상품 등록(`meetup` 없음 → `POST` → A6) · A6 상품 수정(`meetup` 있음 → 바꾼 필드만 `PATCH`).
 * 제목 · 설명은 상품에서 읽으므로 고치면 모든 회차 화면에 반영된다(D1).
 */
export function MeetupForm({ meetup }: { meetup?: Meetup }) {
  const router = useRouter();
  const create = useCreateMeetup();
  const update = useUpdateMeetup(meetup?.id ?? '');
  const mutation = meetup === undefined ? create : update;
  useEndSessionOn401(mutation.error);
  const [notice, setNotice] = useState<{
    tone: 'info' | 'success';
    text: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MeetupFormInput, unknown, CreateMeetupRequest>({
    resolver: zodResolver(CreateMeetupRequestSchema),
    defaultValues: {
      title: meetup?.title ?? '',
      description: meetup?.description ?? '',
    },
  });

  const onSubmit = handleSubmit((values) => {
    setNotice(null);
    if (meetup === undefined) {
      create.mutate(values, {
        onSuccess: (created) => router.push(`/meetups/${created.id}`),
      });
      return;
    }
    const changes = meetupChanges(values, meetup);
    if (Object.keys(changes).length === 0) {
      setNotice({ tone: 'info', text: '바뀐 내용이 없습니다.' });
      return;
    }
    update.mutate(changes, {
      onSuccess: (saved) => {
        reset({ title: saved.title, description: saved.description });
        setNotice({ tone: 'success', text: '저장했습니다.' });
      },
    });
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5"
      aria-busy={mutation.isPending}
    >
      <Notice>
        {PUBLIC_FIELDS_NOTICE}
        {meetup !== undefined ? (
          <>
            <br />
            고친 제목 · 설명은 이 상품의 모든 일정 화면에 30초 안에 반영됩니다.
          </>
        ) : null}
      </Notice>
      <FormField
        label="제목"
        required
        help="참가자에게 보입니다."
        error={errors.title?.message}
      >
        {(control) => (
          <Input
            {...control}
            maxLength={MEETUP_TITLE_MAX_LENGTH}
            autoComplete="off"
            {...register('title')}
          />
        )}
      </FormField>
      <FormField
        label="설명"
        help="참가자에게 보입니다. 줄바꿈은 그대로 보입니다."
        error={errors.description?.message}
      >
        {({ invalid, ...control }) => (
          <textarea
            {...control}
            rows={6}
            maxLength={DESCRIPTION_MAX_LENGTH}
            aria-invalid={invalid || undefined}
            className={textareaClasses}
            {...register('description')}
          />
        )}
      </FormField>
      {mutation.error ? (
        <Notice tone="danger">{describeEventError(mutation.error)}</Notice>
      ) : null}
      {notice !== null ? (
        <Notice tone={notice.tone}>{notice.text}</Notice>
      ) : null}
      <div>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending
            ? '저장 중…'
            : meetup === undefined
              ? '상품 등록'
              : '저장'}
        </Button>
      </div>
    </form>
  );
}
