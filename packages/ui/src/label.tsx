import type { ComponentProps } from 'react';

export interface LabelProps extends ComponentProps<'label'> {
  /** 필수 입력 표시. 별표는 장식이고 스크린 리더에는 "(필수)"로 읽힌다. */
  required?: boolean;
}

/** 폼 라벨. `Input`과 `htmlFor`/`id`로 짝을 맞춘다 (docs/design/design-foundation.md 5절). */
export function Label({
  required = false,
  className,
  children,
  ...props
}: LabelProps) {
  const classes = ['block text-sm font-medium text-ink', className]
    .filter(Boolean)
    .join(' ');

  return (
    <label className={classes} {...props}>
      {children}
      {required ? (
        <>
          <span className="ml-1 text-rose-ink" aria-hidden="true">
            *
          </span>
          <span className="sr-only"> (필수)</span>
        </>
      ) : null}
    </label>
  );
}
