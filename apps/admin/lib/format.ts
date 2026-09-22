import type { AccountStatus, Gender, MemberRole } from '@oneul-sai/contracts';

// 화면 표기는 docs/overview/glossary.md의 한국어 용어를 따른다.

export const STATUS_LABELS: Record<AccountStatus, string> = {
  ACTIVE: '활성',
  SUSPENDED: '정지',
  WITHDRAWN: '탈퇴',
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  MEMBER: '회원',
  ADMIN: '운영자',
};

export const GENDER_LABELS: Record<Gender, string> = {
  MALE: '남성',
  FEMALE: '여성',
};

/** 익명화(탈퇴) · 해당 없음(운영자 계정) 값의 표기. */
export const EMPTY = '—';

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatDateTime(iso: string | null): string {
  return iso === null ? EMPTY : dateTimeFormatter.format(new Date(iso));
}

export function formatDate(iso: string | null): string {
  return iso === null ? EMPTY : dateFormatter.format(new Date(iso));
}

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
