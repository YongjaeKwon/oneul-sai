import Link from 'next/link';
import type { ReactNode } from 'react';

/** 상위 화면으로 가는 링크(예: "← 모임 상품"). */
export function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="self-start text-sm text-ink-soft transition-colors hover:text-ink"
    >
      ← {children}
    </Link>
  );
}
