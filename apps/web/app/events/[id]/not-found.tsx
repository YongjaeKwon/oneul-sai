import { BrandMark } from '@oneul-sai/ui';
import Link from 'next/link';

// W9 404(SPEC-002 4절): UUID가 아닌 id · 없음 · DRAFT · CANCELLED 모두 같은 화면.
export default function EventNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center gap-6 px-6 py-16 text-center">
      <BrandMark size={32} />
      <p className="text-base text-ink">일정을 찾을 수 없습니다.</p>
      <Link
        href="/events"
        className="rounded-control px-3 py-2 text-sm font-medium text-ink underline underline-offset-4 transition-colors hover:bg-rose-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose"
      >
        일정 목록으로
      </Link>
    </main>
  );
}
