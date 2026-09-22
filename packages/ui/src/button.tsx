'use client';

import type { ComponentPropsWithoutRef } from 'react';

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost';
}

const baseClasses =
  'inline-flex items-center justify-center rounded-control px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose disabled:pointer-events-none disabled:opacity-50';

// 본문 대비를 위해 기본 버튼은 딥 브라운, 로즈는 강조/보조에만 쓴다 (docs/design/design-foundation.md)
const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-ink text-paper hover:bg-ink-soft',
  secondary:
    'border border-line-strong bg-surface text-ink hover:bg-rose-wash',
  ghost: 'text-rose-deep hover:bg-rose-wash',
};

export function Button({
  variant = 'primary',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  const classes = [baseClasses, variantClasses[variant], className]
    .filter(Boolean)
    .join(' ');

  return <button type={type} className={classes} {...props} />;
}
