// SPEC-001 12절 로그 마스킹. 회원 식별은 memberId로 하고, 이메일 · 휴대폰이 꼭 필요할 때만 이 형태로 남긴다.
// 도메인 규칙이 아니라 서비스 내부 유틸이므로 공용 패키지에 두지 않는다.

/** `yongjae@gmail.com` → `yo***@gmail.com`. `@`가 없으면 전체를 가린다. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.slice(0, Math.min(2, local.length))}***${domain}`;
}

/** `01012345678` → `010****5678`. 8자리 미만이면 전체를 가린다. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return '***';
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}
