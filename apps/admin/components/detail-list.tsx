import type { ReactNode } from 'react';

export interface DetailItem {
  label: string;
  value: ReactNode;
}

/** 상세 화면의 라벨 · 값 목록. 좁은 화면에서는 세로로, 넓은 화면에서는 두 열로 놓인다. */
export function DetailList({ items }: { items: DetailItem[] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="grid gap-x-8 gap-y-1 py-3 sm:grid-cols-[11rem_1fr]"
        >
          <dt className="text-sm text-ink-soft">{label}</dt>
          <dd className="text-sm text-ink tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
