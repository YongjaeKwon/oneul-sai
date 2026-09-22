import { FieldError } from '@oneul-sai/ui';
import { useId, type ComponentProps, type ReactNode } from 'react';

export interface CheckboxFieldProps extends Omit<
  ComponentProps<'input'>,
  'type'
> {
  label: ReactNode;
  /** 라벨 아래 도움말. */
  hint?: string;
  error?: string;
}

/** 동의 · 설정용 체크박스. 체크 색은 브랜드 로즈(`accent-rose`), 오류는 danger 글자 + 아이콘. */
export function CheckboxField({
  label,
  hint,
  error,
  id,
  className,
  ...inputProps
}: CheckboxFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className={className}>
      <div className="flex items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          aria-invalid={error !== undefined || undefined}
          aria-describedby={error !== undefined ? errorId : undefined}
          className="mt-1 size-4 shrink-0 accent-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose"
          {...inputProps}
        />
        <label htmlFor={inputId} className="text-sm text-ink">
          {label}
          {hint !== undefined ? (
            <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>
          ) : null}
        </label>
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
