'use client';

import {
  PARTICIPANT_CONDITION_MAX_LENGTH,
  PRICE_NOTE_MAX_LENGTH,
  VENUE_ADDRESS_MAX_LENGTH,
  VENUE_AREA_MAX_LENGTH,
  VENUE_DIRECTIONS_MAX_LENGTH,
  VENUE_NAME_MAX_LENGTH,
} from '@oneul-sai/contracts';
import { Input } from '@oneul-sai/ui';
import { useId, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { capacityNotice } from '@/lib/applications';

import { textareaClasses } from '@/lib/form-styles';
import {
  toNumberOrNull,
  type AppliedByGender,
  type ScheduleSharedValues,
} from '@/lib/schedule-form';
import { FormField } from './form-field';

// 숫자 칸은 텍스트 칸(`inputMode="numeric"`)이다 — `type="number"`는 "19-9" 같은 입력을 빈 값으로 넘겨 조용히 지운다.
const numberInput = { setValueAs: toNumberOrNull } as const;

/** 칸 묶음. 제목(명조)이 그룹 이름이 된다. */
function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="flex flex-col gap-4 border-t border-line pt-5"
    >
      <h3 id={titleId} className="text-base font-semibold text-ink">
        {title}
      </h3>
      {children}
    </div>
  );
}

/** 숫자 칸이 비었거나 숫자가 아니면(`NaN`) 옮기지 않고 비운다 — 체크를 끌 때 옆 칸을 채우는 값. */
const copyable = (value: number | null) =>
  value === null || Number.isNaN(value) ? null : value;

/**
 * 회차 폼(A7 · A8)과 여러 회차 등록 공통 값(A9)이 함께 쓰는 칸: 참가비("남녀 같은 금액") · 참가비 보조 문구, 성별 정원 ·
 * 최소 인원, 연령대("남녀 같은 범위") · 참가 조건, 지역 · 장소 안내(SPEC-002 4절 A7 — 개정 2026-10-14).
 * 필드 이름이 요청 필드와 같아 contracts 스키마의 오류가 그 칸에 붙는다.
 * `capacity`가 있으면(A8) 정원 칸 아래에 그 성별의 신청 수를 보이고, 저장된 정원에서 바꾼 값이 신청 수보다 작으면 칸에 알린다
 * (SPEC-003 A8 · D8 — 막지 않는다, 판정은 서버의 409).
 */
export function ScheduleSharedFields({
  capacity,
}: {
  capacity?: { applied: AppliedByGender; saved: AppliedByGender };
} = {}) {
  const {
    register,
    watch,
    getValues,
    setValue,
    clearErrors,
    formState: { errors, touchedFields },
  } = useFormContext<ScheduleSharedValues>();
  const samePrice = watch('samePrice');
  const sameBirthYears = watch('sameBirthYears');
  const [capacityMale, capacityFemale] = useWatch<
    ScheduleSharedValues,
    ['capacityMale', 'capacityFemale']
  >({ name: ['capacityMale', 'capacityFemale'] });
  // 입력하는 중에는 알리지 않는다 — 칸을 벗어난 뒤에(다른 칸 오류와 같은 때) 보인다
  const maleNotice =
    capacity && touchedFields.capacityMale
      ? capacityNotice(capacityMale, capacity.applied.male, capacity.saved.male)
      : undefined;
  const femaleNotice =
    capacity && touchedFields.capacityFemale
      ? capacityNotice(
          capacityFemale,
          capacity.applied.female,
          capacity.saved.female,
        )
      : undefined;
  const samePriceId = useId();
  const sameBirthYearsId = useId();
  const birthYearHelpId = useId();

  /** 연령대 칸 하나. "남녀 같은 범위"가 켜져 있으면 남성 칸만 성별 말 없이 보인다. */
  const birthYearField = (
    name:
      | 'maleMinBirthYear'
      | 'maleMaxBirthYear'
      | 'femaleMinBirthYear'
      | 'femaleMaxBirthYear',
    gender: string,
  ) => {
    const isMin = name.endsWith('MinBirthYear');
    const label = isMin
      ? '앞 연도(가장 이른 출생연도)'
      : '뒤 연도(가장 늦은 출생연도)';
    return (
      <FormField
        key={name}
        label={sameBirthYears ? label : `${gender} ${label}`}
        error={errors[name]?.message}
      >
        {(control) => (
          <Input
            {...control}
            aria-describedby={[birthYearHelpId, control['aria-describedby']]
              .filter(Boolean)
              .join(' ')}
            inputMode="numeric"
            placeholder={isMin ? '예: 1990' : '예: 1995'}
            className="tabular-nums"
            {...register(name, numberInput)}
          />
        )}
      </FormField>
    );
  };

  return (
    <>
      <FieldGroup title="참가비">
        <label
          htmlFor={samePriceId}
          className="flex items-center gap-2 text-sm text-ink"
        >
          <input
            id={samePriceId}
            type="checkbox"
            className="size-4 accent-ink"
            {...register('samePrice', {
              // 끌 때 두 칸을 한 칸의 값으로 채워 둔다(A7).
              onChange: (event: { target: { checked: boolean } }) => {
                if (!event.target.checked) {
                  setValue('priceFemale', copyable(getValues('priceMale')));
                }
              },
            })}
          />
          남녀 같은 금액
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={samePrice ? '참가비(원)' : '남 참가비(원)'}
            required
            error={errors.priceMale?.message}
          >
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                className="tabular-nums"
                {...register('priceMale', numberInput)}
              />
            )}
          </FormField>
          {samePrice ? null : (
            <FormField
              label="여 참가비(원)"
              required
              error={errors.priceFemale?.message}
            >
              {(control) => (
                <Input
                  {...control}
                  inputMode="numeric"
                  className="tabular-nums"
                  {...register('priceFemale', numberInput)}
                />
              )}
            </FormField>
          )}
        </div>
        <FormField
          label="참가비 보조 문구"
          help="참가비 옆에 보입니다. 예: 커피 1잔 포함"
          error={errors.priceNote?.message}
        >
          {(control) => (
            <Input
              {...control}
              maxLength={PRICE_NOTE_MAX_LENGTH}
              autoComplete="off"
              {...register('priceNote')}
            />
          )}
        </FormField>
      </FieldGroup>

      <FieldGroup title="성별 정원">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label="남 정원(명)"
            required
            help={
              capacity === undefined
                ? undefined
                : `신청 ${capacity.applied.male}명`
            }
            error={errors.capacityMale?.message ?? maleNotice}
          >
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                className="tabular-nums"
                {...register('capacityMale', numberInput)}
              />
            )}
          </FormField>
          <FormField
            label="여 정원(명)"
            required
            help={
              capacity === undefined
                ? undefined
                : `신청 ${capacity.applied.female}명`
            }
            error={errors.capacityFemale?.message ?? femaleNotice}
          >
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                className="tabular-nums"
                {...register('capacityFemale', numberInput)}
              />
            )}
          </FormField>
          <FormField
            label="최소 인원(명)"
            help="행사를 진행하는 데 필요한 성별 최소 인원입니다. 미달 여부는 운영자가 판단합니다 — 자동으로 취소되지 않습니다."
            error={errors.minPerGender?.message}
          >
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                className="tabular-nums"
                {...register('minPerGender', numberInput)}
              />
            )}
          </FormField>
        </div>
      </FieldGroup>

      <FieldGroup title="연령대(출생연도)">
        <label
          htmlFor={sameBirthYearsId}
          className="flex items-center gap-2 text-sm text-ink"
        >
          <input
            id={sameBirthYearsId}
            type="checkbox"
            className="size-4 accent-ink"
            {...register('sameBirthYears', {
              // 끌 때 여성 칸을 남성 값으로 채워 둔다(A7 — D16).
              onChange: (event: { target: { checked: boolean } }) => {
                if (!event.target.checked) {
                  setValue(
                    'femaleMinBirthYear',
                    copyable(getValues('maleMinBirthYear')),
                  );
                  setValue(
                    'femaleMaxBirthYear',
                    copyable(getValues('maleMaxBirthYear')),
                  );
                  // 켜진 동안 숨은 여성 칸에 붙은 오류(남성 값을 옮긴 검사 결과)는 낡았다 — 다음 검사가 다시 판정한다
                  clearErrors(['femaleMinBirthYear', 'femaleMaxBirthYear']);
                }
              },
            })}
          />
          남녀 같은 범위
        </label>
        <p id={birthYearHelpId} className="text-xs text-ink-soft">
          비우면 그 성별은 제한이 없습니다.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {birthYearField('maleMinBirthYear', '남성')}
          {birthYearField('maleMaxBirthYear', '남성')}
          {sameBirthYears ? null : (
            <>
              {birthYearField('femaleMinBirthYear', '여성')}
              {birthYearField('femaleMaxBirthYear', '여성')}
            </>
          )}
        </div>
      </FieldGroup>

      <div className="border-t border-line pt-5">
        <FormField
          label="참가 조건"
          help="참가자에게 그대로 보입니다. 예: 90년대생 직장인"
          error={errors.participantCondition?.message}
        >
          {(control) => (
            <Input
              {...control}
              maxLength={PARTICIPANT_CONDITION_MAX_LENGTH}
              autoComplete="off"
              {...register('participantCondition')}
            />
          )}
        </FormField>
      </div>

      <FieldGroup title="장소">
        <FormField
          label="지역"
          required
          help="참가자에게 공개됩니다. 정확한 장소는 아래 장소 안내 칸에 적어 주세요."
          error={errors.venueArea?.message}
        >
          {(control) => (
            <Input
              {...control}
              maxLength={VENUE_AREA_MAX_LENGTH}
              autoComplete="off"
              {...register('venueArea')}
            />
          )}
        </FormField>
        <p className="text-xs text-ink-soft">
          아래 장소 안내는 운영자 화면에만 있습니다. 나중에 채워도 됩니다.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="장소 이름" error={errors.venueName?.message}>
            {(control) => (
              <Input
                {...control}
                maxLength={VENUE_NAME_MAX_LENGTH}
                autoComplete="off"
                {...register('venueName')}
              />
            )}
          </FormField>
          <FormField label="주소" error={errors.venueAddress?.message}>
            {(control) => (
              <Input
                {...control}
                maxLength={VENUE_ADDRESS_MAX_LENGTH}
                autoComplete="off"
                {...register('venueAddress')}
              />
            )}
          </FormField>
        </div>
        <FormField label="찾아오는 길" error={errors.venueDirections?.message}>
          {({ invalid, ...control }) => (
            <textarea
              {...control}
              rows={3}
              maxLength={VENUE_DIRECTIONS_MAX_LENGTH}
              aria-invalid={invalid || undefined}
              className={textareaClasses}
              {...register('venueDirections')}
            />
          )}
        </FormField>
        <FormField
          label="지도 링크"
          help="카카오맵 · 네이버 지도에서 공유한 링크를 붙여 넣어 주세요."
          error={errors.venueMapUrl?.message}
        >
          {(control) => (
            <Input
              {...control}
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              {...register('venueMapUrl')}
            />
          )}
        </FormField>
      </FieldGroup>
    </>
  );
}
