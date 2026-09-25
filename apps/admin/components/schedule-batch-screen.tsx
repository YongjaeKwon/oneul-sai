'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ADMIN_LIST_MAX_PAGE_SIZE,
  API_ERROR_CODES,
  SCHEDULE_BATCH_MAX,
  type Meetup,
} from '@oneul-sai/contracts';
import { Button, Dialog, Input, Label } from '@oneul-sai/ui';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { FormProvider, useForm } from 'react-hook-form';

import { useEndSessionOn401 } from '@/lib/auth-provider';
import { describeEventError, isApiClientError } from '@/lib/errors';
import { selectClasses } from '@/lib/form-styles';
import {
  EMPTY,
  formatCapacity,
  formatPrice,
  formatScheduleDate,
  formatScheduleRange,
  formatScheduleTime,
  fromSeoulLocal,
} from '@/lib/format';
import { useCreateSchedulesBatch, useMeetupList } from '@/lib/queries';
import {
  BATCH_LIMIT_MESSAGE,
  BatchCommonSchema,
  batchCommonDefaults,
  batchFormKey,
  buildRows,
  checkRows,
  extractItemIndexes,
  weeklyDates,
  type BatchCommonValues,
  type BatchRow,
} from '@/lib/schedule-batch';
import {
  NOT_A_NUMBER_MESSAGE,
  nextSunday,
  toNumberOrNull,
  type ScheduleSharedValues,
} from '@/lib/schedule-form';
import { BackLink } from './back-link';
import { FormField } from './form-field';
import { MeetupScope } from './meetup-scope';
import { Notice } from './notice';
import { PageHeader } from './page-header';
import { ScheduleSharedFields } from './schedule-shared-fields';
import { Section } from './section';

interface PreviewTable {
  rows: BatchRow[];
  /** 표를 만들 때의 공통 값(남성 연령대 · 장소 안내는 모든 행에 같다). */
  shared: ScheduleSharedValues;
  /** 행 검사의 "지금" — 표를 만들 때 읽는다. 제출 직전에는 새로 읽어 다시 확인한다. */
  checkedAt: number;
  /** 행에서 고친 적이 있는지 — 다시 만들기 전에 묻는다. */
  edited: boolean;
  /** 표를 만들 때 보낼 공통 값(`batchFormKey`). 지금 입력과 다르면 표가 낡은 것이다(남성 연령대 · 장소 안내는 표에 안 보인다). */
  formKey: string;
}

/** 날짜 칸 오류와 그 오류가 가리키는 칸. */
interface DateError {
  field: 'firstDate' | 'weeks' | 'pickDate';
  message: string;
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_INVALID_MESSAGE = '날짜를 확인해 주세요.';
/** 날짜 칸의 연도를 네 자리로 막는다(다섯 자리 연도는 날짜 계산에서 RangeError). */
const DATE_INPUT_MAX = '9999-12-31';

// 여러 회차 등록의 400 `SCHEDULE_TIME_INVALID`는 저장과 같은 문구 대신 "새로 고침" 없이 행을 고치게 안내한다(표가 사라지지 않게).
const ROW_ERROR_OVERRIDES = {
  [API_ERROR_CODES.SCHEDULE_TIME_INVALID]:
    '일시가 맞지 않습니다. 이 회차의 일시를 고쳐 주세요.',
};

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function rowWhen(row: BatchRow): string {
  return LOCAL_DATE_TIME.test(row.startsAt) && LOCAL_DATE_TIME.test(row.endsAt)
    ? formatScheduleRange(
        fromSeoulLocal(row.startsAt),
        fromSeoulLocal(row.endsAt),
      )
    : EMPTY;
}

function rowDeadline(row: BatchRow): string {
  return LOCAL_DATE_TIME.test(row.applyDeadlineAt)
    ? formatScheduleTime(fromSeoulLocal(row.applyDeadlineAt))
    : EMPTY;
}

/** A9 여러 회차 등록(`/meetups/[meetupId]/schedules/batch`, D15). */
export function ScheduleBatchScreen({ meetupId }: { meetupId: string }) {
  return (
    <MeetupScope meetupId={meetupId}>
      {(meetup) => <BatchForm meetup={meetup} />}
    </MeetupScope>
  );
}

/**
 * 상품 선택 → 날짜 고르기(매주 반복 · 날짜 직접 고르기) → 공통 값 한 번 입력 → 미리보기 표(행마다 고치기 · 빼기)
 * → 한 번에 제출(전부 DRAFT, 전부 또는 없음). 400이면 `message`의 `items.<순번>`을 그 행에 표시한다.
 */
function BatchForm({ meetup }: { meetup: Meetup }) {
  const router = useRouter();
  const meetupSelectId = useId();
  const firstDateId = useId();
  const weeksId = useId();
  const pickDateId = useId();
  const dateErrorId = useId();
  const rebuildQuestionId = useId();
  const submitQuestionId = useId();
  const tableRef = useRef<HTMLDivElement>(null);

  const meetups = useMeetupList({ pageSize: ADMIN_LIST_MAX_PAGE_SIZE });
  const [targetId, setTargetId] = useState(meetup.id);

  const [mode, setMode] = useState<'weekly' | 'manual'>('weekly');
  const [firstDate, setFirstDate] = useState(() => nextSunday(Date.now()));
  const [weeks, setWeeks] = useState('');
  const [pickDate, setPickDate] = useState('');
  const [manualDates, setManualDates] = useState<string[]>([]);
  const [dateError, setDateError] = useState<DateError | null>(null);
  /** 오류가 가리키는 날짜 칸에 붙일 속성. */
  const dateErrorProps = (field: DateError['field']) =>
    dateError?.field === field
      ? { invalid: true, 'aria-describedby': dateErrorId }
      : {};

  const form = useForm<BatchCommonValues>({
    resolver: zodResolver(BatchCommonSchema),
    defaultValues: batchCommonDefaults(),
    mode: 'onTouched',
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  // 공통 값 입력이 바뀔 때마다 다시 그린다 — 미리보기 뒤에 보낼 값이 바뀌었는지 알아야 한다
  const formKey = batchFormKey(form.watch());

  const [table, setTable] = useState<PreviewTable | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [pendingTable, setPendingTable] = useState<PreviewTable | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const mutation = useCreateSchedulesBatch();
  useEndSessionOn401(mutation.error);
  // 등록에 성공하면 화면을 떠날 때까지 잠근다 — 이동 전에 다시 누르면 같은 회차가 한 번 더 등록된다
  const locked = mutation.isPending || mutation.isSuccess;

  // 등록 요청 중에는 표를 바꾸지 않는다 — reset()이 요청의 onSuccess를 떼어 내 이동 없이 버튼이 다시 켜지고, 다시 누르면 중복 등록된다
  const applyTable = (next: PreviewTable | null) => {
    if (locked) {
      return;
    }
    setTable(next);
    setEditingKey(null);
    setPendingTable(null);
    mutation.reset();
  };

  const addManualDate = () => {
    if (pickDate === '' || manualDates.includes(pickDate)) {
      return;
    }
    if (!LOCAL_DATE.test(pickDate)) {
      setDateError({ field: 'pickDate', message: DATE_INVALID_MESSAGE });
      return;
    }
    if (manualDates.length >= SCHEDULE_BATCH_MAX) {
      setDateError({ field: 'pickDate', message: BATCH_LIMIT_MESSAGE });
      return;
    }
    setDateError(null);
    setManualDates([...manualDates, pickDate].sort());
  };

  const pickedDates = (): string[] | null => {
    if (mode === 'manual') {
      if (manualDates.length === 0) {
        setDateError({
          field: 'pickDate',
          message: '날짜를 하나 이상 추가해 주세요.',
        });
        return null;
      }
      return manualDates;
    }
    if (firstDate === '') {
      setDateError({ field: 'firstDate', message: '첫 날짜를 골라 주세요.' });
      return null;
    }
    if (!LOCAL_DATE.test(firstDate)) {
      setDateError({ field: 'firstDate', message: DATE_INVALID_MESSAGE });
      return null;
    }
    const weekCount = toNumberOrNull(weeks);
    if (weekCount !== null && Number.isNaN(weekCount)) {
      setDateError({ field: 'weeks', message: NOT_A_NUMBER_MESSAGE });
      return null;
    }
    const dates = weeklyDates(firstDate, weekCount);
    if (dates === null) {
      setDateError({ field: 'weeks', message: BATCH_LIMIT_MESSAGE });
    }
    return dates;
  };

  const makePreview = (common: BatchCommonValues, now: number) => {
    const dates = pickedDates();
    if (dates === null) {
      return;
    }
    setDateError(null);
    const next: PreviewTable = {
      rows: buildRows(dates, common),
      shared: common,
      checkedAt: now,
      edited: false,
      formKey: batchFormKey(form.getValues()),
    };
    if (table?.edited === true) {
      setPendingTable(next);
      return;
    }
    applyTable(next);
  };

  const changeRows = (rows: BatchRow[]) => {
    if (table === null || locked) {
      return;
    }
    setTable({ ...table, rows, edited: true });
    mutation.reset();
  };

  const updateRow = (key: string, patch: Partial<BatchRow>) =>
    changeRows(
      (table?.rows ?? []).map((row) =>
        row.key === key ? { ...row, ...patch } : row,
      ),
    );

  /** 행을 빼고 포커스를 다음 행의 "빼기"로(없으면 앞 행, 그것도 없으면 표) 옮긴다 — 누른 버튼이 사라져 포커스를 잃지 않게. */
  const removeRow = (index: number) => {
    if (table === null || locked) {
      return;
    }
    const rest = table.rows.filter((_, i) => i !== index);
    const target = rest[index] ?? rest[index - 1];
    flushSync(() => changeRows(rest));
    const button =
      target === undefined
        ? null
        : tableRef.current?.querySelector<HTMLElement>(
            `[data-remove-key="${target.key}"]`,
          );
    (button ?? tableRef.current)?.focus();
  };

  const check =
    table === null
      ? null
      : checkRows(table.rows, table.shared, table.checkedAt);
  const stale = table !== null && table.formKey !== formKey;
  const hasWarnings =
    check !== null &&
    Object.values(check.byKey).some(
      (row) => row.notSunday || row.capacityDiffers,
    );

  const send = () => {
    setConfirmSubmit(false);
    if (table === null || stale || locked) {
      return;
    }
    // 제출 직전의 "지금"으로 다시 확인한다(표를 만든 뒤 시간이 흘렀을 수 있다).
    const now = Date.now();
    const fresh = checkRows(table.rows, table.shared, now);
    if (fresh.items === null) {
      setTable({ ...table, checkedAt: now });
      return;
    }
    mutation.mutate(
      { meetupId: targetId, input: { items: fresh.items } },
      {
        onSuccess: (result) =>
          router.push(`/meetups/${targetId}?registered=${result.items.length}`),
      },
    );
  };

  // 400이면 아무 회차도 만들어지지 않았다. `items.<순번>`은 행 표시에만 쓰고 문구는 `code`로 고른다.
  const failure = mutation.error;
  const failedIndexes =
    isApiClientError(failure) && failure.status === 400
      ? extractItemIndexes(failure.message)
      : [];
  const failedKeys = new Set(
    failedIndexes.map((index) => table?.rows[index]?.key),
  );
  const rowFailure =
    failedIndexes.length > 0
      ? describeEventError(failure, ROW_ERROR_OVERRIDES)
      : null;

  const meetupOptions = [
    meetup,
    ...(meetups.data?.items ?? []).filter((item) => item.id !== meetup.id),
  ];
  const rowCount = table?.rows.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`/meetups/${meetup.id}`}>{meetup.title}</BackLink>
      <PageHeader title="여러 회차 등록">
        <p>
          한 상품의 회차를 한 번에 {SCHEDULE_BATCH_MAX}개까지 비공개로
          등록합니다. 모두 등록되거나 하나도 등록되지 않습니다. 공개는 등록한 뒤
          회차 목록에서 골라서 합니다.
        </p>
      </PageHeader>

      <Section title="상품">
        <div className="max-w-md">
          <Label htmlFor={meetupSelectId} required>
            모임 상품
          </Label>
          <select
            id={meetupSelectId}
            value={targetId}
            className={`${selectClasses} mt-1.5`}
            onChange={(event) => setTargetId(event.target.value)}
          >
            {meetupOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="날짜 고르기">
        <div className="flex flex-col gap-4">
          <div
            role="radiogroup"
            aria-label="날짜 고르는 방법"
            className="flex flex-wrap gap-4 text-sm text-ink"
          >
            {(
              [
                ['weekly', '매주 반복'],
                ['manual', '날짜 직접 고르기'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="date-mode"
                  value={value}
                  checked={mode === value}
                  className="size-4 accent-ink"
                  onChange={() => {
                    setMode(value);
                    setDateError(null);
                  }}
                />
                {label}
              </label>
            ))}
          </div>

          {mode === 'weekly' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor={firstDateId} required>
                  첫 날짜
                </Label>
                <Input
                  id={firstDateId}
                  type="date"
                  max={DATE_INPUT_MAX}
                  value={firstDate}
                  className="mt-1.5 tabular-nums"
                  {...dateErrorProps('firstDate')}
                  onChange={(event) => setFirstDate(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor={weeksId} required>
                  주 수(1~{SCHEDULE_BATCH_MAX})
                </Label>
                <Input
                  id={weeksId}
                  inputMode="numeric"
                  value={weeks}
                  className="mt-1.5 tabular-nums"
                  {...dateErrorProps('weeks')}
                  onChange={(event) => setWeeks(event.target.value)}
                />
                <p className="mt-1.5 text-xs text-ink-soft">
                  첫 날짜부터 7일 간격으로 만듭니다.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label htmlFor={pickDateId}>날짜</Label>
                  <Input
                    id={pickDateId}
                    type="date"
                    max={DATE_INPUT_MAX}
                    value={pickDate}
                    className="mt-1.5 tabular-nums"
                    {...dateErrorProps('pickDate')}
                    onChange={(event) => setPickDate(event.target.value)}
                  />
                </div>
                <Button variant="secondary" onClick={addManualDate}>
                  추가
                </Button>
              </div>
              {manualDates.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {manualDates.map((date) => (
                    <li
                      key={date}
                      className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1 text-sm text-ink"
                    >
                      <span className="font-display tabular-nums">
                        {formatScheduleDate(date)}
                      </span>
                      <button
                        type="button"
                        className="text-ink-soft hover:text-ink"
                        aria-label={`${date} 빼기`}
                        onClick={() =>
                          setManualDates(manualDates.filter((d) => d !== date))
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-soft">
                  날짜를 하나씩 골라 추가해 주세요. 같은 날짜는 한 번만
                  들어갑니다.
                </p>
              )}
            </div>
          )}
          {dateError !== null ? (
            <p id={dateErrorId} role="alert" className="text-sm text-danger">
              {dateError.message}
            </p>
          ) : null}
        </div>
      </Section>

      <Section title="공통 값">
        <FormProvider {...form}>
          <form
            onSubmit={(event) => {
              const now = Date.now();
              void handleSubmit((common) => makePreview(common, now))(event);
            }}
            noValidate
            className="flex flex-col gap-5"
          >
            <p className="text-sm text-ink-soft">
              한 번 넣으면 모든 회차에 들어갑니다. 서울 시각입니다.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                label="시작 시각"
                required
                error={errors.startTime?.message}
              >
                {(control) => (
                  <Input
                    {...control}
                    type="time"
                    step={60}
                    className="tabular-nums"
                    {...register('startTime')}
                  />
                )}
              </FormField>
              <FormField
                label="종료 시각"
                required
                help="같은 날짜 안에서 시작보다 늦어야 합니다."
                error={errors.endTime?.message}
              >
                {(control) => (
                  <Input
                    {...control}
                    type="time"
                    step={60}
                    className="tabular-nums"
                    {...register('endTime')}
                  />
                )}
              </FormField>
              <FormField
                label="신청 마감(행사 N시간 전)"
                required
                help="0이면 시작 시각에 마감합니다."
                error={errors.hoursBefore?.message}
              >
                {(control) => (
                  <Input
                    {...control}
                    inputMode="numeric"
                    className="tabular-nums"
                    {...register('hoursBefore', { setValueAs: toNumberOrNull })}
                  />
                )}
              </FormField>
            </div>

            <ScheduleSharedFields />

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="secondary" disabled={locked}>
                미리보기 만들기
              </Button>
              {/* 날짜 칸은 위에 있어 여기서도 한 번 더 알린다(스크린 리더에는 위의 alert만). */}
              {dateError !== null ? (
                <p className="text-sm text-danger">{dateError.message}</p>
              ) : null}
            </div>
          </form>
        </FormProvider>
      </Section>

      {table !== null && check !== null ? (
        <Section title="미리보기">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-soft">
              남성 연령대 · 장소 안내는 모든 회차에 같습니다. 회차마다
              달리하려면 등록한 뒤 회차 상세에서 고쳐 주세요.
            </p>
            {failure ? (
              <Notice tone="danger">
                {failedIndexes.length > 0
                  ? `${failedIndexes.map((index) => index + 1).join(' · ')}번째 회차를 확인해 주세요. 아무 회차도 등록되지 않았습니다.`
                  : describeEventError(failure)}
              </Notice>
            ) : null}
            {/* 카드(Section) 안이라 표에는 테두리 · 배경을 다시 두지 않는다(디자인 파운데이션 4절 6). 행을 모두 빼면 여기로 포커스 */}
            <div
              ref={tableRef}
              tabIndex={-1}
              className="relative overflow-x-auto"
            >
              <table className="w-full min-w-max text-left text-sm">
                <thead className="border-b border-line text-xs text-ink-soft">
                  <tr>
                    {[
                      '순번',
                      '일시',
                      '신청 마감',
                      '참가비',
                      '정원',
                      '지역',
                      '확인',
                      '고치기 · 빼기',
                    ].map((column, index) => (
                      <th
                        key={index}
                        scope="col"
                        className="px-4 py-3 font-medium whitespace-nowrap"
                      >
                        {index === 0 || index === 7 ? (
                          <span className="sr-only">{column}</span>
                        ) : (
                          column
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {table.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-12 text-center text-ink-soft"
                      >
                        남은 회차가 없습니다. 미리보기를 다시 만들어 주세요.
                      </td>
                    </tr>
                  ) : (
                    table.rows.map((row, index) => {
                      const rowCheck = check.byKey[row.key];
                      const serverError = failedKeys.has(row.key)
                        ? rowFailure
                        : null;
                      return (
                        <BatchPreviewRow
                          key={row.key}
                          row={row}
                          index={index}
                          errors={[
                            ...(rowCheck?.errors ?? []),
                            ...(serverError !== null ? [serverError] : []),
                          ]}
                          notes={[
                            ...(rowCheck?.notSunday ? ['일요일 아님'] : []),
                            ...(rowCheck?.capacityDiffers
                              ? ['남녀 정원 다름']
                              : []),
                          ]}
                          editing={editingKey === row.key}
                          disabled={locked}
                          onEdit={() =>
                            setEditingKey(
                              editingKey === row.key ? null : row.key,
                            )
                          }
                          onRemove={() => removeRow(index)}
                          onChange={(patch) => updateRow(row.key, patch)}
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={check.items === null || stale || locked}
                onClick={() => (hasWarnings ? setConfirmSubmit(true) : send())}
              >
                {mutation.isPending ? '등록 중…' : `${rowCount}개 회차 등록`}
              </Button>
              {stale ? (
                <p className="text-sm text-ink-soft">
                  공통 값이 바뀌었습니다. 미리보기를 다시 만들어 주세요.
                </p>
              ) : null}
              {check.items === null && rowCount > 0 ? (
                <p className="text-sm text-ink-soft">
                  확인 칸에 문제가 있는 회차를 고치거나 빼 주세요.
                </p>
              ) : null}
            </div>
          </div>
        </Section>
      ) : null}

      <Dialog
        open={pendingTable !== null}
        title="미리보기 다시 만들기"
        onClose={() => setPendingTable(null)}
        describedBy={rebuildQuestionId}
      >
        <p id={rebuildQuestionId}>
          행에서 고친 내용이 사라집니다. 다시 만들까요?
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => applyTable(pendingTable)}>다시 만들기</Button>
          {/* 행에서 고친 내용을 버리는 동작이라 처음 포커스는 "닫기" */}
          <Button
            variant="ghost"
            data-autofocus
            onClick={() => setPendingTable(null)}
          >
            닫기
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirmSubmit}
        title="확인"
        onClose={() => setConfirmSubmit(false)}
        describedBy={submitQuestionId}
      >
        <p id={submitQuestionId}>
          남녀 정원이 다르거나 일요일이 아닌 회차가 있습니다. 이대로 등록할까요?
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={locked} onClick={send}>
            등록
          </Button>
          <Button variant="ghost" onClick={() => setConfirmSubmit(false)}>
            다시 고치기
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function BatchPreviewRow({
  row,
  index,
  errors,
  notes,
  editing,
  disabled,
  onEdit,
  onRemove,
  onChange,
}: {
  row: BatchRow;
  index: number;
  errors: string[];
  notes: string[];
  editing: boolean;
  disabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onChange: (patch: Partial<BatchRow>) => void;
}) {
  // 비었거나 숫자가 아닌(NaN) 값은 "—"로 둔다 — 문제는 확인 칸이 알린다
  const priced =
    Number.isFinite(row.priceMale) && Number.isFinite(row.priceFemale);
  const staffed =
    Number.isFinite(row.capacityMale) && Number.isFinite(row.capacityFemale);

  return (
    <>
      <tr className="align-top">
        <td className="px-4 py-3 text-ink-soft tabular-nums">{index + 1}</td>
        <td className="px-4 py-3 font-display whitespace-nowrap text-ink tabular-nums">
          {rowWhen(row)}
        </td>
        <td className="px-4 py-3 font-display whitespace-nowrap text-ink tabular-nums">
          {rowDeadline(row)}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-ink tabular-nums">
          {priced
            ? formatPrice(row.priceMale ?? 0, row.priceFemale ?? 0)
            : EMPTY}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-ink tabular-nums">
          {staffed
            ? formatCapacity(row.capacityMale ?? 0, row.capacityFemale ?? 0)
            : EMPTY}
        </td>
        <td className="px-4 py-3 text-ink">{row.venueArea || EMPTY}</td>
        <td className="max-w-64 px-4 py-3 text-xs whitespace-normal">
          {errors.map((message) => (
            <p key={message} className="text-danger">
              {message}
            </p>
          ))}
          {notes.map((note) => (
            <p key={note} className="text-ink-soft">
              {note}
            </p>
          ))}
          {errors.length === 0 && notes.length === 0 ? (
            <span className="text-ink-soft">확인됨</span>
          ) : null}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <Button
            variant="ghost"
            disabled={disabled}
            aria-label={`${index + 1}번째 회차 고치기`}
            aria-expanded={editing}
            onClick={onEdit}
          >
            {editing ? '고치기 끝' : '고치기'}
          </Button>
          <Button
            variant="ghost"
            disabled={disabled}
            aria-label={`${index + 1}번째 회차 빼기`}
            data-remove-key={row.key}
            onClick={onRemove}
          >
            빼기
          </Button>
        </td>
      </tr>
      {editing ? (
        <tr className="bg-ivory">
          <td colSpan={8} className="px-4 py-4">
            <fieldset disabled={disabled} className="contents">
              <RowEditor row={row} index={index} onChange={onChange} />
            </fieldset>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * 행 고치기: 시작 · 종료 · 신청 마감 · 참가비 · 정원 · 지역을 그 자리에서 바꾼다(A9). 행 값은 이 편집기에서만 바뀌므로
 * 칸을 제어하지 않는다 — 숫자 칸에 입력한 글자가 그대로 남고, 숫자가 아니면 행 확인 칸에 "숫자로 입력해 주세요."가 뜬다.
 */
function RowEditor({
  row,
  index,
  onChange,
}: {
  row: BatchRow;
  index: number;
  onChange: (patch: Partial<BatchRow>) => void;
}) {
  const baseId = useId();
  const field = (
    name: keyof Omit<BatchRow, 'key'>,
    label: string,
    type: 'datetime-local' | 'number' | 'text',
  ) => {
    const id = `${baseId}-${name}`;
    const value = row[name];
    return (
      <div key={name}>
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type={type === 'datetime-local' ? type : 'text'}
          step={type === 'datetime-local' ? 60 : undefined}
          inputMode={type === 'number' ? 'numeric' : undefined}
          defaultValue={
            value === null || Number.isNaN(value) ? '' : String(value)
          }
          className="mt-1.5 tabular-nums"
          onChange={(event) =>
            onChange({
              [name]:
                type === 'number'
                  ? toNumberOrNull(event.target.value)
                  : event.target.value,
            } as Partial<BatchRow>)
          }
        />
      </div>
    );
  };

  return (
    <div
      role="group"
      aria-label={`${index + 1}번째 회차 고치기`}
      className="grid gap-4 sm:grid-cols-3"
    >
      {field('startsAt', '시작', 'datetime-local')}
      {field('endsAt', '종료', 'datetime-local')}
      {field('applyDeadlineAt', '신청 마감', 'datetime-local')}
      {field('priceMale', '남 참가비(원)', 'number')}
      {field('priceFemale', '여 참가비(원)', 'number')}
      {field('venueArea', '지역', 'text')}
      {field('capacityMale', '남 정원(명)', 'number')}
      {field('capacityFemale', '여 정원(명)', 'number')}
    </div>
  );
}
