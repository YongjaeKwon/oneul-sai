import type { ComponentPropsWithoutRef } from 'react';

export type HighlightProps = ComponentPropsWithoutRef<'span'>;

// 브러시 하이라이트 — 핵심 단어 뒤에 살짝 기울인 rose-wash 붓 자국(docs/design/design-foundation.md 4절 3 · 5절).
// 한 화면에 한 곳만 쓴다. 글자색은 물려받는다(ink) — rose-deep 글자는 rose-wash 위에서 대비가 3:1에 못 미친다(2절).
const baseClasses =
  'relative isolate inline-block before:absolute before:inset-x-[-0.1em] before:bottom-[0.1em] before:-z-10 before:h-[0.45em] before:-skew-x-12 before:bg-rose-wash';

export function Highlight({ className, ...props }: HighlightProps) {
  const classes = [baseClasses, className].filter(Boolean).join(' ');

  return <span className={classes} {...props} />;
}
