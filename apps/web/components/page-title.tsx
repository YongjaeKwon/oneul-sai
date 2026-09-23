import { Divider } from '@oneul-sai/ui';
import type { ReactNode } from 'react';

export interface PageTitleProps {
  /** 보통 글자. `/events`처럼 한 단어에 `Highlight`를 둘 때는 노드를 넘긴다. */
  title: ReactNode;
  description?: string;
}

/** 화면 제목 — 명조 제목 아래 짧은 로즈 구분선(docs/design/design-foundation.md 4절 2). */
export function PageTitle({ title, description }: PageTitleProps) {
  return (
    <header className="flex flex-col items-center gap-3 text-center">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <Divider variant="accent" />
      {description ? (
        <p className="text-sm text-ink-soft">{description}</p>
      ) : null}
    </header>
  );
}
