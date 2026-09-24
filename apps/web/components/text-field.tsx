import { FieldError, Input, Label, type InputProps } from '@oneul-sai/ui';
import { useId } from 'react';

export interface TextFieldProps extends InputProps {
  label: string;
  /** 입력 아래 도움말. */
  hint?: string;
  /** 검증 실패 문구(react-hook-form의 `errors.<field>.message`). */
  error?: string;
}

/**
 * 라벨 + 입력 + 오류 문구 한 벌. `required`는 라벨 표시에만 쓰고 input에는 넘기지 않는다 —
 * 검증은 Zod가 하므로 브라우저 기본 검증(말풍선)이 먼저 끼어들지 않게 한다.
 */
export function TextField({
  label,
  hint,
  error,
  required,
  id,
  className,
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy =
    [hint !== undefined ? hintId : null, error !== undefined ? errorId : null]
      .filter((value) => value !== null)
      .join(' ') || undefined;

  return (
    <div className={className}>
      <Label htmlFor={inputId} required={required}>
        {label}
      </Label>
      <Input
        id={inputId}
        className="mt-1.5"
        invalid={error !== undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {hint !== undefined ? (
        <p id={hintId} className="mt-1.5 text-xs text-ink-soft">
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
