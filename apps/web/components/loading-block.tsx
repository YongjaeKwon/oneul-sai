/** 부팅 refresh · 조회를 기다리는 동안의 자리. 로그인 여부를 판정한 뒤 렌더한다(SPEC-001 4절 W3). */
export function LoadingBlock() {
  return (
    <p role="status" className="py-16 text-center text-sm text-ink-muted">
      불러오는 중…
    </p>
  );
}
