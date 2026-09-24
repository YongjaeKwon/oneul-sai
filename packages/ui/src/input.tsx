import type { ComponentProps } from 'react';

export interface InputProps extends ComponentProps<'input'> {
  /** 검증 실패 상태. `aria-invalid`를 켜고 테두리를 `danger`로 바꾼다. */
  invalid?: boolean;
}

// 폼 입력: ivory 배경, 포커스 시 rose 2px 외곽선, 오류는 danger 테두리 (docs/design/design-foundation.md 5절).
// 글자는 16px — 모바일 브라우저가 입력 포커스 때 화면을 확대하지 않게 한다.
const baseClasses =
  'block w-full rounded-control border bg-ivory px-4 py-2 text-base text-ink placeholder:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-rose disabled:cursor-not-allowed disabled:opacity-50';

export function Input({
  invalid = false,
  type = 'text',
  className,
  ...props
}: InputProps) {
  const classes = [
    baseClasses,
    invalid ? 'border-danger' : 'border-line',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <input
      type={type}
      aria-invalid={invalid || undefined}
      className={classes}
      {...props}
    />
  );
}
