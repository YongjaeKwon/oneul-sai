import { Divider } from '@oneul-sai/ui';
import type { ReactNode } from 'react';

/**
 * 화면 제목(명조) + 짧은 로즈 구분선 + 설명. 관리자 화면은 왼쪽 정렬이라 구분선도 왼쪽에 둔다
 * (디자인 파운데이션 4절 1 · 2).
 */
export function PageHeader({
  title,
  children,
  actions,
}: {
  title: ReactNode;
  /** 제목 아래 설명 · 배지. */
  children?: ReactNode;
  /** 오른쪽 버튼. */
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-3">
        <h1 className="text-2xl font-semibold text-ink tabular-nums">
          {title}
        </h1>
        <Divider variant="accent" className="ml-0" />
        {children !== undefined ? (
          <div className="flex flex-col gap-2 text-sm text-ink-soft">
            {children}
          </div>
        ) : null}
      </div>
      {actions !== undefined ? (
        <div className="flex flex-wrap gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
