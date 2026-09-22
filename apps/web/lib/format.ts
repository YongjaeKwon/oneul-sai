import type { Gender } from '@oneul-sai/contracts';

// 화면 표기는 docs/overview/glossary.md의 한국어 용어를 따른다.

export const GENDER_LABELS: Record<Gender, string> = {
  MALE: '남성',
  FEMALE: '여성',
};

/** 값이 없을 때(운영자 계정의 성별 · 출생연도 · 휴대폰)의 표기. */
export const EMPTY = '—';

/** 숫자만 저장된 휴대폰 번호(SPEC-001 7절)를 하이픈으로 나눈다. 예: 01012345678 → 010-1234-5678 */
export function formatPhone(phone: string | null): string {
  if (phone === null) {
    return EMPTY;
  }
  if (phone.length === 11) {
    return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`;
  }
  if (phone.length === 10) {
    return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
  }
  return phone;
}

export function formatBirthYear(birthYear: number | null): string {
  return birthYear === null ? EMPTY : `${birthYear}년`;
}
