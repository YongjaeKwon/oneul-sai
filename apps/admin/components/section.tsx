import type { ReactNode } from 'react';

/** 상세 화면의 카드 한 칸(표면 + line 테두리, 제목은 명조 — 디자인 파운데이션 4절 6). */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface px-6 py-5">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
