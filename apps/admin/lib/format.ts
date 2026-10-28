import { SERVICE_TIME_ZONE } from '@oneul-sai/constants';
import type {
  AccountStatus,
  AdminSchedule,
  Gender,
  MemberRole,
  ScheduleStatus,
} from '@oneul-sai/contracts';

// 화면 표기는 docs/overview/glossary.md의 한국어 용어를 따른다. 날짜 · 시간은 항상 서울 시각(SPEC-002 D7).

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
  timeZone: SERVICE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: SERVICE_TIME_ZONE,
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

// ----- 회차 (SPEC-002) -----

/** 서울 시각의 offset. 한국은 서머타임이 없어 고정값이다(SPEC-002 D7). */
const SEOUL_OFFSET = '+09:00';

const seoulPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SERVICE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 절대 시각 → 서울 벽시계 `YYYY-MM-DDTHH:mm`(`<input type="datetime-local">` 값). 브라우저 시간대와 무관하다. */
export function toSeoulLocal(time: string | number | Date): string {
  const parts: Record<string, string> = {};
  for (const part of seoulPartsFormatter.formatToParts(new Date(time))) {
    parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** 서울 벽시계 `YYYY-MM-DDTHH:mm` → API 시각(`2026-10-04T14:00:00+09:00`). */
export function fromSeoulLocal(local: string): string {
  return `${local}:00${SEOUL_OFFSET}`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** `YYYY-MM-DD`(달력 날짜)의 요일. 0 = 일요일. */
export function weekdayOf(date: string): number {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).getUTCDay();
}

/** 서울 달력 날짜(`YYYY-MM-DD` 또는 벽시계 값) → "10/4(일)". */
export function formatScheduleDate(local: string): string {
  const month = Number(local.slice(5, 7));
  const day = Number(local.slice(8, 10));
  return `${month}/${day}(${WEEKDAYS[weekdayOf(local)]})`;
}

/** 운영 메시지와 같은 "10/4(일) 14:00". */
export function formatScheduleTime(iso: string): string {
  const local = toSeoulLocal(iso);
  return `${formatScheduleDate(local)} ${local.slice(11, 16)}`;
}

/** "10/4(일) 14:00~16:30". 종료가 다른 날이면 종료에도 날짜를 붙인다. */
export function formatScheduleRange(startsAt: string, endsAt: string): string {
  const start = toSeoulLocal(startsAt);
  const end = toSeoulLocal(endsAt);
  const endText =
    start.slice(0, 10) === end.slice(0, 10)
      ? end.slice(11, 16)
      : formatScheduleTime(endsAt);
  return `${formatScheduleDate(start)} ${start.slice(11, 16)}~${endText}`;
}

/** "30,000원". */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

/**
 * 참가비 문구(D3 · D17): 같으면 "참가비 30,000원", 다르면 "참가비 남 30,000원 · 여 25,000원".
 * 보조 문구가 있으면 뒤에 " · 커피 1잔 포함"(예시)을 붙인다.
 */
export function formatPrice(
  priceMale: number,
  priceFemale: number,
  priceNote: string | null = null,
): string {
  const price =
    priceMale === priceFemale
      ? `참가비 ${formatWon(priceMale)}`
      : `참가비 남 ${formatWon(priceMale)} · 여 ${formatWon(priceFemale)}`;
  return priceNote === null ? price : `${price} · ${priceNote}`;
}

/** "정원 남 7 · 여 7", 최소 인원이 있으면 뒤에 " · 최소 5"(D17 — 운영자 화면만). */
export function formatCapacity(
  capacityMale: number,
  capacityFemale: number,
  minPerGender: number | null = null,
): string {
  const capacity = `정원 남 ${capacityMale} · 여 ${capacityFemale}`;
  return minPerGender === null
    ? capacity
    : `${capacity} · 최소 ${minPerGender}`;
}

/** 한 성별의 연령대: "1990~1995년생" · "1990년생부터" · "1995년생까지", 범위가 없으면 빈 문자열. */
function formatBirthYearRange(min: number | null, max: number | null): string {
  if (min !== null && max !== null) {
    return `${min}~${max}년생`;
  }
  if (min !== null) {
    return `${min}년생부터`;
  }
  if (max !== null) {
    return `${max}년생까지`;
  }
  return '';
}

/**
 * 연령대 문구(D16 — 7절 규칙). 남녀 문구가 같으면 성별 말 없이 하나("1990~1999년생"), 다르면
 * "남성 1990~1995년생 · 여성 1990~1999년생", 한 성별만 있으면 그 성별만("남성 1990년생부터"), 둘 다 없으면 빈 문자열.
 */
export function formatBirthYears(
  schedule: Pick<
    AdminSchedule,
    | 'maleMinBirthYear'
    | 'maleMaxBirthYear'
    | 'femaleMinBirthYear'
    | 'femaleMaxBirthYear'
  >,
): string {
  const male = formatBirthYearRange(
    schedule.maleMinBirthYear,
    schedule.maleMaxBirthYear,
  );
  const female = formatBirthYearRange(
    schedule.femaleMinBirthYear,
    schedule.femaleMaxBirthYear,
  );
  if (male === female) {
    return male;
  }
  return [male && `남성 ${male}`, female && `여성 ${female}`]
    .filter(Boolean)
    .join(' · ');
}

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  DRAFT: '비공개',
  OPEN: '모집 중',
  CLOSED: '모집 마감',
  CANCELLED: '취소',
};

export interface ScheduleStatusView {
  tone: 'success' | 'neutral' | 'danger';
  label: string;
  /** 배지 옆 보조 글자. */
  note?: string;
}

/**
 * 회차 상태 배지(SPEC-002 4절 운영자 웹). OPEN이어도 신청 마감이 지났으면 참가자 화면과 같게 "모집 마감"으로 보이고
 * 저장된 상태를 보조 글자로 알린다. 마감 시각에 상태를 바꾸는 배치는 없다(D8).
 */
export function scheduleStatusView(
  schedule: Pick<AdminSchedule, 'status' | 'applyDeadlineAt'>,
  now: number,
): ScheduleStatusView {
  switch (schedule.status) {
    case 'OPEN':
      return Date.parse(schedule.applyDeadlineAt) <= now
        ? {
            tone: 'neutral',
            label: '모집 마감',
            note: '신청 마감 시각 지남 · 상태: 공개',
          }
        : { tone: 'success', label: SCHEDULE_STATUS_LABELS.OPEN };
    case 'CANCELLED':
      return { tone: 'danger', label: SCHEDULE_STATUS_LABELS.CANCELLED };
    default:
      return {
        tone: 'neutral',
        label: SCHEDULE_STATUS_LABELS[schedule.status],
      };
  }
}
