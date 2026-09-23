'use client';

import { FieldError, Label } from '@oneul-sai/ui';
import { useId, type ReactNode } from 'react';

/** 입력 요소에 넘길 연결 값. `Input`은 그대로 펼치고, textarea · select는 `aria-invalid`로 옮긴다. */
export interface FieldControl {
  id: string;
  invalid: boolean;
  'aria-describedby': string | undefined;
}

export interface FormFieldProps {
  label: string;
  required?: boolean;
  /** 칸 아래 도움말(예: "참가자에게 공개됩니다."). */
  help?: ReactNode;
  error?: string;
  className?: string;
  children: (control: FieldControl) => ReactNode;
}

/** 라벨 · 입력 · 도움말 · 오류 한 묶음(디자인 파운데이션 5절 "폼 입력"). */
export function FormField({
  label,
  required = false,
  help,
  error,
  className,
  children,
}: FormFieldProps) {
  const id = useId();
  const helpId = useId();
  const errorId = useId();
  const describedBy =
    [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className={className}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <div className="mt-1.5">
        {children({
          id,
          invalid: error !== undefined,
          'aria-describedby': describedBy,
        })}
      </div>
      {help ? (
        <p id={helpId} className="mt-1.5 text-xs text-ink-soft">
          {help}
        </p>
      ) : null}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
