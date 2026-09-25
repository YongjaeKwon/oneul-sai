'use client';

import {
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

/**
 * 회차 폼(A7 · A8)과 여러 회차 등록 공통 값(A9)이 함께 쓰는 칸: 참가비("남녀 같은 금액"), 성별 정원,
 * 남성 연령대, 지역 · 장소 안내. 필드 이름이 요청 필드와 같아 contracts 스키마의 오류가 그 칸에 붙는다.
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
    formState: { errors },
  } = useFormContext<ScheduleSharedValues>();
  const samePrice = watch('samePrice');
  const [capacityMale, capacityFemale] = useWatch<
    ScheduleSharedValues,
    ['capacityMale', 'capacityFemale']
  >({ name: ['capacityMale', 'capacityFemale'] });
  const maleNotice =
    capacity &&
    capacityNotice(capacityMale, capacity.applied.male, capacity.saved.male);
  const femaleNotice =
    capacity &&
    capacityNotice(
      capacityFemale,
      capacity.applied.female,
      capacity.saved.female,
    );
  const samePriceId = useId();

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
                  const price = getValues('priceMale');
                  setValue(
                    'priceFemale',
                    price === null || Number.isNaN(price) ? null : price,
                  );
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
      </FieldGroup>

      <FieldGroup title="성별 정원">
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
      </FieldGroup>

      <FieldGroup title="남성 연령대(출생연도)">
        <p className="text-xs text-ink-soft">
          여성에게는 연령 조건이 없습니다. 비우면 남성도 제한이 없습니다.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="앞 연도(가장 이른 출생연도)"
            error={errors.maleMinBirthYear?.message}
          >
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                placeholder="예: 1990"
                className="tabular-nums"
                {...register('maleMinBirthYear', numberInput)}
              />
            )}
          </FormField>
          <FormField
            label="뒤 연도(가장 늦은 출생연도)"
            error={errors.maleMaxBirthYear?.message}
          >
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                placeholder="예: 1995"
                className="tabular-nums"
                {...register('maleMaxBirthYear', numberInput)}
              />
            )}
          </FormField>
        </div>
      </FieldGroup>

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
