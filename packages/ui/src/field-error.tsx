import type { ReactNode } from 'react';

export interface FieldErrorProps {
  /** `Input`의 `aria-describedby`가 가리킬 id. */
  id?: string;
  /** 오류 문구. 비어 있으면 아무것도 그리지 않는다. */
  children?: ReactNode;
  className?: string;
}

/** 입력 아래 오류 문구 — danger 글자 + 아이콘. 색만으로 뜻을 전하지 않는다 (docs/design/design-foundation.md 2절). */
export function FieldError({ id, children, className }: FieldErrorProps) {
  if (children === undefined || children === null || children === false) {
    return null;
  }

  const classes = [
    'mt-1.5 flex items-start gap-1.5 text-sm text-danger',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <p id={id} role="alert" className={classes}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="mt-0.5 shrink-0"
      >
        <circle
          cx="8"
          cy="8"
          r="7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M8 4.5v4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="8" cy="11.25" r="0.9" fill="currentColor" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
