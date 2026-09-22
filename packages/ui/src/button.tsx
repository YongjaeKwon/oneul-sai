'use client';

import type { ComponentPropsWithoutRef } from 'react';

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: 'primary' | 'secondary';
}

const baseClasses =
  'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50';

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-rose-500 text-white hover:bg-rose-600 focus-visible:outline-rose-500',
  secondary:
    'border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 focus-visible:outline-rose-300',
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
