import type { ComponentPropsWithoutRef } from 'react';

/**
 * 상태 배지 색조 — docs/design/design-foundation.md 5절.
 * 확정 `success`, 입금 대기 `warning`, 취소 `danger`, 대기자 `mauve`, 그 밖의 중립 상태 `neutral`.
 */
export type BadgeTone = 'success' | 'warning' | 'danger' | 'mauve' | 'neutral';

export interface BadgeProps extends ComponentPropsWithoutRef<'span'> {
  tone?: BadgeTone;
}

// 반지름 999px(파운데이션 4절 7). 의미는 글자가 전하고 색은 테두리 · 점으로만 보조한다(2절 대비 규칙) —
// 글자는 ink라 어떤 색조에서도 대비가 유지된다.
const baseClasses =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-surface px-2.5 py-0.5 text-xs font-medium text-ink';

const toneClasses: Record<BadgeTone, { border: string; dot: string }> = {
  success: { border: 'border-success', dot: 'bg-success' },
  warning: { border: 'border-warning', dot: 'bg-warning' },
  danger: { border: 'border-danger', dot: 'bg-danger' },
  mauve: { border: 'border-mauve', dot: 'bg-mauve' },
  neutral: { border: 'border-line-strong', dot: 'bg-ink-muted' },
};

export function Badge({
  tone = 'neutral',
  className,
  children,
  ...props
}: BadgeProps) {
  const { border, dot } = toneClasses[tone];
  const classes = [baseClasses, border, className].filter(Boolean).join(' ');

  return (
    <span className={classes} {...props}>
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${dot}`}
      />
      {children}
    </span>
  );
}
