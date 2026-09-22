export interface DividerProps {
  /**
   * `accent`: 제목 아래 짧은 로즈 구분선(1px × 64px, 가운데) — 팜플렛의 구분선(파운데이션 4절 2).
   * `line`: 섹션을 나누는 긴 회색 선.
   */
  variant?: 'accent' | 'line';
  className?: string;
}

const variantClasses: Record<NonNullable<DividerProps['variant']>, string> = {
  accent: 'mx-auto w-16 bg-line-strong',
  line: 'w-full bg-line',
};

export function Divider({ variant = 'line', className }: DividerProps) {
  const classes = ['h-px border-0', variantClasses[variant], className]
    .filter(Boolean)
    .join(' ');

  return <hr className={classes} />;
}
