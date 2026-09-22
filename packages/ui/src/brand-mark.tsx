export interface BrandMarkProps {
  /** 픽셀 단위 높이. 너비는 비율(3:2)에 맞춰 계산된다. */
  size?: number;
  className?: string;
}

/**
 * 오늘사이 로고 마크 — 겹치는 두 원. 겹치는 부분이 '사이'다.
 * 색은 테마 토큰(rose-soft / mauve / rose-deep)을 따른다.
 */
export function BrandMark({ size = 40, className }: BrandMarkProps) {
  const width = Math.round(size * 1.5);
  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 60 40"
      aria-hidden="true"
      className={className}
    >
      <circle cx="22" cy="20" r="18" className="fill-rose-soft" />
      <circle cx="38" cy="20" r="18" className="fill-mauve" />
      <path
        d="M30 4.6a18 18 0 0 1 0 30.8a18 18 0 0 1 0-30.8z"
        className="fill-rose-deep"
      />
    </svg>
  );
}
