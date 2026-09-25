'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type {
  AdminSchedule,
  CreateScheduleRequest,
  UpdateScheduleRequest,
} from '@oneul-sai/contracts';
import { Button, Dialog, Input } from '@oneul-sai/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { useEndSessionOn401 } from '@/lib/auth-provider';
import { describeEventError } from '@/lib/errors';
import {
  scheduleChanges,
  scheduleFormDefaults,
  scheduleFormSchema,
  scheduleWarnings,
  type ScheduleFormValues,
  type TimeField,
} from '@/lib/schedule-form';
import { useCreateSchedule, useUpdateSchedule } from '@/lib/queries';
import { FormField } from './form-field';
import { Notice } from './notice';
import { ScheduleSharedFields } from './schedule-shared-fields';

interface Pending {
  request: CreateScheduleRequest;
  changes: UpdateScheduleRequest | null;
  warnings: string[];
}

/**
 * A7 회차 만들기(`schedule` 없음 → `POST`, 항상 DRAFT → A8) · A8 회차 수정(바꾼 필드만 `PATCH`, 비운 선택 칸은 `null`).
 * 입력 시각은 브라우저 시간대와 무관하게 서울 시각으로 보낸다(`+09:00`). 일요일이 아니거나 남녀 정원이 다르면
 * 제출 전에 한 번 묻는다 — 경고일 뿐 막지 않는다(D2 · D6).
 */
export function ScheduleForm({
  meetupId,
  schedule,
}: {
  meetupId: string;
  schedule?: AdminSchedule;
}) {
  const router = useRouter();
  const creating = schedule === undefined;
  const create = useCreateSchedule(meetupId);
  const update = useUpdateSchedule(meetupId, schedule?.id ?? '');
  const mutation = creating ? create : update;
  useEndSessionOn401(mutation.error);
  // 만들기는 성공하면 상세로 떠나므로 그때까지 잠근다(다시 누르면 한 번 더 만들어진다). 수정은 이 화면에 남아 다시 저장할 수 있다.
  const locked = mutation.isPending || (creating && mutation.isSuccess);

  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<{
    tone: 'info' | 'success';
    text: string;
  } | null>(null);

  // 폼이 보여 주는 저장본. 다시 불러온 `schedule`(캐시 갱신)로 바꾸지 않는다 — 그러면 손대지 않은 칸이 "바뀜"으로 보내진다.
  // 저장에 성공하면 응답으로 바꾼다.
  const [baseline, setBaseline] = useState(schedule);
  const schema = useMemo(() => scheduleFormSchema(baseline), [baseline]);
  const [defaults] = useState(() => scheduleFormDefaults(baseline, Date.now()));
  const form = useForm<ScheduleFormValues, unknown, CreateScheduleRequest>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    mode: 'onTouched',
  });
  const {
    register,
    handleSubmit,
    getFieldState,
    setValue,
    trigger,
    reset,
    formState: { errors },
  } = form;

  const send = ({ request, changes }: Pending) => {
    if (locked) {
      return;
    }
    if (creating) {
      create.mutate(request, {
        onSuccess: (created) =>
          router.push(`/meetups/${meetupId}/schedules/${created.id}`),
      });
      return;
    }
    if (changes !== null) {
      update.mutate(changes, {
        onSuccess: (saved) => {
          setBaseline(saved);
          reset(scheduleFormDefaults(saved, Date.now()));
          setNotice({ tone: 'success', text: '저장했습니다.' });
        },
      });
    }
  };

  const onSubmit = handleSubmit((request) => {
    setNotice(null);
    const changes =
      baseline === undefined ? null : scheduleChanges(request, baseline);
    if (changes !== null && Object.keys(changes).length === 0) {
      setNotice({ tone: 'info', text: '바뀐 내용이 없습니다.' });
      return;
    }
    const warnings = scheduleWarnings(request, changes ?? undefined);
    const next = { request, changes, warnings };
    if (warnings.length > 0) {
      setPending(next);
      return;
    }
    send(next);
  });

  /** 시작을 바꾸면 이미 본 종료 · 신청 마감 칸의 순서 오류를 다시 확인한다. 새 회차의 신청 마감은 손대기 전까지 시작을 따라간다. */
  const onStartsAtChange = (event: { target: { value: string } }) => {
    if (creating && !getFieldState('applyDeadlineAt').isDirty) {
      setValue('applyDeadlineAt', event.target.value);
    }
    const dependents = (['endsAt', 'applyDeadlineAt'] as const).filter(
      (field) =>
        getFieldState(field).isTouched ||
        getFieldState(field).error !== undefined,
    );
    if (dependents.length > 0) {
      void trigger(dependents);
    }
  };

  const timeInput = (field: TimeField) =>
    register(
      field,
      field === 'startsAt' ? { onChange: onStartsAtChange } : undefined,
    );

  const published =
    schedule !== undefined &&
    (schedule.status === 'OPEN' || schedule.status === 'CLOSED');
  const actionLabel = creating ? '등록' : '저장';

  return (
    <FormProvider {...form}>
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-5"
        aria-busy={mutation.isPending}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label="시작"
            required
            help="서울 시각입니다."
            error={errors.startsAt?.message}
          >
            {(control) => (
              <Input
                {...control}
                type="datetime-local"
                step={60}
                className="tabular-nums"
                {...timeInput('startsAt')}
              />
            )}
          </FormField>
          <FormField label="종료" required error={errors.endsAt?.message}>
            {(control) => (
              <Input
                {...control}
                type="datetime-local"
                step={60}
                className="tabular-nums"
                {...timeInput('endsAt')}
              />
            )}
          </FormField>
          <FormField
            label="신청 마감"
            required
            help="시작 시각보다 늦을 수 없습니다."
            error={errors.applyDeadlineAt?.message}
          >
            {(control) => (
              <Input
                {...control}
                type="datetime-local"
                step={60}
                className="tabular-nums"
                {...timeInput('applyDeadlineAt')}
              />
            )}
          </FormField>
        </div>

        <ScheduleSharedFields />

        {mutation.error ? (
          <Notice tone="danger">{describeEventError(mutation.error)}</Notice>
        ) : null}
        {notice !== null ? (
          <Notice tone={notice.tone}>{notice.text}</Notice>
        ) : null}
        {published ? (
          <Notice>
            공개 중인 일정입니다. 저장하면 참가자 화면에 30초 안에 반영됩니다.
          </Notice>
        ) : null}
        <div>
          <Button type="submit" disabled={locked}>
            {mutation.isPending
              ? '처리 중…'
              : creating
                ? '회차 만들기'
                : '저장'}
          </Button>
        </div>
      </form>

      <Dialog
        open={pending !== null}
        title="확인"
        onClose={() => setPending(null)}
      >
        {pending !== null ? (
          <>
            <p>
              {pending.warnings.join(' ')} 이대로 {actionLabel}할까요?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  send(pending);
                  setPending(null);
                }}
              >
                {actionLabel}
              </Button>
              <Button variant="ghost" onClick={() => setPending(null)}>
                다시 고치기
              </Button>
            </div>
          </>
        ) : null}
      </Dialog>
    </FormProvider>
  );
}
