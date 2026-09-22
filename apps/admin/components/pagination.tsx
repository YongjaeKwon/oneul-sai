'use client';

import { Button } from '@oneul-sai/ui';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  disabled?: boolean;
  onChange: (page: number) => void;
}

/** 목록 페이지 이동. 현재 위치는 "1 / 5" 표기(docs/design/design-foundation.md 4절 5). */
export function Pagination({
  page,
  pageSize,
  total,
  disabled = false,
  onChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <nav
      aria-label="페이지 이동"
      className="flex items-center justify-between gap-4"
    >
      <Button
        variant="secondary"
        disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        이전
      </Button>
      <p className="font-display text-sm text-ink-soft tabular-nums">
        <span className="text-ink">{page}</span> / {totalPages}
      </p>
      <Button
        variant="secondary"
        disabled={disabled || page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        다음
      </Button>
    </nav>
  );
}
