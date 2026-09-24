import { BrandMark } from '@oneul-sai/ui';

/** 부팅 refresh · 화면 전환 동안의 로딩 상태(SPEC-001 4절 — 로그인 여부를 판정한 뒤 렌더한다). */
export function ScreenLoading({
  message = '확인하고 있습니다…',
}: {
  message?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16"
    >
      <BrandMark size={32} />
      <p className="text-sm text-ink-soft">{message}</p>
    </div>
  );
}
