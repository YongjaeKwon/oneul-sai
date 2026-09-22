import type { ReactNode } from 'react';

export type NoticeTone = 'info' | 'success' | 'danger';

// 색은 테두리로만 보조하고 뜻은 글이 전한다(docs/design/design-foundation.md 2절 대비 규칙).
const toneClasses: Record<NoticeTone, string> = {
  info: 'border-line text-ink-soft',
  success: 'border-success text-ink',
  danger: 'border-danger text-ink',
};

export interface NoticeProps {
  tone?: NoticeTone;
  children: ReactNode;
  className?: string;
}

/** 화면 안내 · 오류 문구. `danger`는 스크린 리더가 바로 읽도록 `alert`로 둔다. */
export function Notice({ tone = 'info', children, className }: NoticeProps) {
  const classes = [
    'rounded-card border bg-surface px-4 py-3 text-sm leading-relaxed',
    toneClasses[tone],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={classes}>
      {children}
    </div>
  );
}
