import { SERVICE_TIME_ZONE } from '@oneul-sai/constants';
import {
  ListPageSchema,
  type ApplicationCancelledBy,
  type ApplicationStatus,
  type Gender,
  type PublicSchedule,
} from '@oneul-sai/contracts';
import type { BadgeTone } from '@oneul-sai/ui';

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

// ----- 일정 (SPEC-002 4절 W8 · W9, 7절 "표시 도우미") -----
// 시각은 어느 환경(서버 TZ=UTC 포함)에서도 서울 시각으로 보인다(D7). 한국은 서머타임이 없다.

const dateTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: SERVICE_TIME_ZONE,
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function seoulParts(iso: string) {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of dateTimeFormat.formatToParts(new Date(iso))) {
    parts[part.type] = part.value;
  }
  return {
    date: `${parts.month}/${parts.day}(${parts.weekday})`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** "10/4(일) 14:00" — 운영 메시지와 같은 형식. */
export function formatDateTime(iso: string): string {
  const { date, time } = seoulParts(iso);
  return `${date} ${time}`;
}

/** "10/4(일) 14:00~16:30". 서울 날짜가 바뀌면 끝에도 날짜를 붙인다. */
export function formatTimeRange(startsAt: string, endsAt: string): string {
  const start = seoulParts(startsAt);
  const end = seoulParts(endsAt);
  const endLabel =
    end.date === start.date ? end.time : `${end.date} ${end.time}`;
  return `${start.date} ${start.time}~${endLabel}`;
}

/** "30,000원". */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

/** 같으면 "참가비 30,000원", 다르면 "참가비 남 30,000원 · 여 25,000원"(D3). */
export function formatPrice(priceMale: number, priceFemale: number): string {
  return priceMale === priceFemale
    ? formatFee(priceMale)
    : `참가비 남 ${formatWon(priceMale)} · 여 ${formatWon(priceFemale)}`;
}

/** "참가비 30,000원" — 신청 한 건에는 신청 때 고정한 금액(`price`, SPEC-003 D6)을 보인다. */
export function formatFee(price: number): string {
  return `참가비 ${formatWon(price)}`;
}

/** "정원 남 7 · 여 7". 남은 자리 수 · 자리 마감은 보이지 않는다 — 접수는 정원과 무관하다(SPEC-003 D10 · ★S2). */
export function formatCapacity(
  capacityMale: number,
  capacityFemale: number,
): string {
  return `정원 남 ${capacityMale} · 여 ${capacityFemale}`;
}

/** 남성 연령대(D5). 범위가 없으면 빈 문자열 — 연령 문구를 보이지 않는다. */
export function formatMaleAgeRange(
  min: number | null,
  max: number | null,
): string {
  if (min !== null && max !== null) {
    return `남성 ${min}~${max}년생`;
  }
  if (min !== null) {
    return `남성 ${min}년생부터`;
  }
  if (max !== null) {
    return `남성 ${max}년생까지`;
  }
  return '';
}

/** 상세 화면에서 남성 연령대가 있을 때만 덧붙인다(목록 카드에는 붙이지 않는다). */
export const FEMALE_AGE_NOTE =
  '여성은 원하는 일정을 골라 신청하실 수 있습니다.';

// 아래 두 판정의 `now` 기본값은 요청 시각이다 — 공개 페이지는 서버 컴포넌트라 요청마다 한 번 렌더한다.

/** "모집 마감" 표시: 운영자가 마감했거나(CLOSED) 신청 마감 시각이 지났다. 마감 시각에 상태를 바꾸는 배치는 없다(D8). */
export function isRecruitmentClosed(
  schedule: Pick<PublicSchedule, 'status' | 'applyDeadlineAt'>,
  now: number = Date.now(),
): boolean {
  return (
    schedule.status === 'CLOSED' || Date.parse(schedule.applyDeadlineAt) <= now
  );
}

/**
 * W8 · W9 배지 — "모집 마감"뿐이다(SPEC-002). 성별 자리 마감 표시는 없다 — 공개 응답에 자리 값이 없고 접수는 정원과
 * 무관하다(SPEC-003 ★S2). 공개 조회는 30초 캐시라 늦게 보일 수 있다 — 신청 판정의 원천은 서버다.
 */
export function scheduleBadgeLabel(
  schedule: Pick<PublicSchedule, 'status' | 'applyDeadlineAt'>,
  now: number = Date.now(),
): string | null {
  return isRecruitmentClosed(schedule, now) ? '모집 마감' : null;
}

/** "지난 일정입니다." 표시: 시작 시각이 지났다. */
export function hasStarted(
  schedule: Pick<PublicSchedule, 'startsAt'>,
  now: number = Date.now(),
): boolean {
  return Date.parse(schedule.startsAt) <= now;
}

/** `?page=`를 [1, PAGE_MAX] 정수로 고정한다. 잘못된 값은 1(`abc` · `0` · `-1` · `1.5` · `1001`). */
export function normalizePage(value: unknown): number {
  const result = ListPageSchema.safeParse(value);
  return result.success ? result.data : 1;
}

// ----- 참가 신청 (SPEC-003 4절 W9 · W10, SPEC-004 4절 K) -----

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: '접수',
  PENDING: '입금 대기',
  CONFIRMED: '참가 확정',
  CANCELLED: '취소',
};

/** 디자인 파운데이션 5절 `Badge` — 접수 `neutral`(S7), 입금 대기 `warning`, 참가 확정 `success`, 취소 `danger`. 뜻은 글자가 전한다. */
export const APPLICATION_STATUS_TONES: Record<ApplicationStatus, BadgeTone> = {
  APPLIED: 'neutral',
  PENDING: 'warning',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
};

/** W10 취소된 신청 카드의 한 줄 — 누가 취소했는지. */
export const CANCELLED_BY_NOTES: Record<ApplicationCancelledBy, string> = {
  MEMBER: '직접 취소했습니다.',
  ADMIN: '오늘사이에서 취소했습니다.',
  SCHEDULE: '일정이 취소되었습니다.',
};
