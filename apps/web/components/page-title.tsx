import { Divider } from '@oneul-sai/ui';

export interface PageTitleProps {
  title: string;
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
