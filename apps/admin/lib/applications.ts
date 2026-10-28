import {
  API_ERROR_CODES,
  type AdminApplication,
  type AdminSchedule,
  type ApplicationCancelledBy,
  type ApplicationStatus,
  type Gender,
  type MemberSummary,
  type UpdateScheduleRequest,
} from '@oneul-sai/contracts';
import type { BadgeTone } from '@oneul-sai/ui';

import { describeError, isApiClientError } from './errors';
import { GENDER_LABELS } from './format';

// SPEC-003 4절 "운영자 웹" A6 · A8 · A10의 표시 도우미와 문구(개정 2026-10-14 — 접수 · 참가 가능 안내). 판정의 원천은 서버다.

type AppliedCounts = Pick<
  AdminSchedule,
  | 'appliedMale'
  | 'capacityMale'
  | 'appliedFemale'
  | 'capacityFemale'
  | 'receivedMale'
  | 'receivedFemale'
>;

/**
 * "남 3/7 · 여 5/7 · 접수 남 2 · 여 1" — 성별 자리 잡은 신청 수(입금 대기 · 참가 확정) / 정원, 뒤에 접수 수(SPEC-003 D17).
 * 접수가 0이어도 늘 보인다(포맷 하나). 문장 속에서는 앞에 "신청"을 붙인다.
 */
export function formatAppliedCounts(schedule: AppliedCounts): string {
  return `남 ${schedule.appliedMale}/${schedule.capacityMale} · 여 ${schedule.appliedFemale}/${schedule.capacityFemale} · 접수 남 ${schedule.receivedMale} · 여 ${schedule.receivedFemale}`;
}

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: '접수',
  PENDING: '입금 대기',
  CONFIRMED: '참가 확정',
  CANCELLED: '취소',
};

/** 디자인 파운데이션 5절 `Badge` — 접수 `neutral`(S7), 입금 대기 `warning`, 참가 확정 `success`(SPEC-004), 취소 `danger`. 뜻은 글자가 전한다. */
export const APPLICATION_STATUS_TONES: Record<ApplicationStatus, BadgeTone> = {
  APPLIED: 'neutral',
  PENDING: 'warning',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
};

/** 취소 배지 옆 보조 글자 — 누가 취소했는지. */
export const CANCELLED_BY_LABELS: Record<ApplicationCancelledBy, string> = {
  MEMBER: '본인',
  ADMIN: '운영자',
  SCHEDULE: '회차 취소',
};

// ----- A10 상태 필터(주소의 `?status=`) -----

export type ApplicationFilter = ApplicationStatus | 'ALL';

export const APPLICATION_FILTERS: readonly {
  value: ApplicationFilter;
  label: string;
}[] = [
  { value: 'APPLIED', label: '접수' },
  { value: 'PENDING', label: '입금 대기' },
  { value: 'CONFIRMED', label: '참가 확정' },
  { value: 'CANCELLED', label: '취소' },
  { value: 'ALL', label: '전체' },
];

/**
 * `?status=` → 필터. 없거나 모르는 값이면 "전체"(SPEC-004 K-1 — 한 회차 7+7 규모는 한 화면에 다 보인다).
 * 취소된 회차도 같다 — A8의 "신청 목록 보기"가 `?status=CANCELLED`를 명시해 연다.
 */
export function applicationFilterOf(value: unknown): ApplicationFilter {
  return (
    APPLICATION_FILTERS.find((filter) => filter.value === value)?.value ?? 'ALL'
  );
}

// ----- A10 신청 · 회원 합치기(D11) -----

export interface ApplicationRow {
  application: AdminApplication;
  /** 회원 정보를 불러오지 못했거나 결과에 없으면 null — 신청 정보만 보인다. */
  member: MemberSummary | null;
}

/** 한 페이지의 신청에 `GET /members?ids=` 결과를 `memberId`로 붙인다. 순서는 신청 순 그대로. */
export function mergeApplicants(
  applications: readonly AdminApplication[],
  members: readonly MemberSummary[] | undefined,
): ApplicationRow[] {
  const byId = new Map((members ?? []).map((member) => [member.id, member]));
  return applications.map((application) => ({
    application,
    member: byId.get(application.memberId) ?? null,
  }));
}

/** 한 번의 `ids` 조회에 넣을 회원 ID — 같은 회원의 여러 신청(취소 뒤 다시 신청)은 한 번만. */
export function memberIdsOf(
  applications: readonly AdminApplication[],
): string[] {
  return [...new Set(applications.map((application) => application.memberId))];
}

const ADMIN_CANCEL_AFTERWORD =
  '취소하면 이 회원은 이 회차에 다시 신청할 수 없습니다. 신청자에게는 따로 안내해 주세요.';

/**
 * 운영자 취소 확인 창의 질문(A10). 탈퇴한 회원은 4절대로 "이 신청을 취소할까요?" 한 문장 — 다시 신청할 수도, 따로 안내할
 * 연락처도 없다. 회원 정보를 불러오지 못해 이름만 모르면 앞 문장만 바꾸고 뒤 문장은 둔다.
 */
export function adminCancelQuestion(member: MemberSummary | null): string {
  if (member?.status === 'WITHDRAWN') {
    return '이 신청을 취소할까요?';
  }
  const who =
    member?.name != null
      ? `${member.name}님의 신청을 취소할까요?`
      : '이 신청을 취소할까요?';
  return `${who} ${ADMIN_CANCEL_AFTERWORD}`;
}

/**
 * 접수 줄의 "참가 가능 안내" 버튼(A10 줄 표). 탈퇴한 회원 줄에는 취소만 — 연락할 수 없다(SPEC-004 L-3 선례).
 * 회원 정보를 모르면(조회 실패) 버튼은 두고 질문만 "이 신청에 …"로 바꾼다.
 */
export function canInvite({ application, member }: ApplicationRow): boolean {
  return application.status === 'APPLIED' && member?.status !== 'WITHDRAWN';
}

/** 참가 가능 안내 확인 창의 질문(S7). 성별은 신청의 스냅샷 — 안내하면 그 성별의 자리를 잡는다. */
export function inviteQuestion(
  member: MemberSummary | null,
  gender: Gender,
): string {
  const who =
    member?.name != null
      ? `${member.name}님께 참가 가능 안내를 할까요?`
      : '이 신청에 참가 가능 안내를 할까요?';
  return `${who} 안내하면 ${GENDER_LABELS[gender]} 자리를 하나 잡고 신청이 입금 대기로 바뀝니다. 안내 메시지는 따로 보내 주세요.`;
}

/** 참가 가능 안내의 오류 문구(SPEC-003 4절 표) — `SCHEDULE_FULL`은 그 줄의 신청 성별을 넣는다. 404는 취소와 같다. */
export function inviteErrorOverrides(
  gender: Gender,
): Partial<Record<string, string>> {
  return {
    ...APPLICATION_ERROR_OVERRIDES,
    [API_ERROR_CODES.SCHEDULE_FULL]: `${GENDER_LABELS[gender]} 자리가 모두 찼습니다. 자리 잡은 신청을 취소하거나 정원을 늘린 뒤 다시 안내해 주세요.`,
    [API_ERROR_CODES.INVALID_STATUS_TRANSITION]:
      '접수 상태의 신청만 안내할 수 있습니다. 목록을 새로 고쳐 주세요.',
  };
}

/**
 * 출생연도 옆 "연령대 밖"(★S1 (a) — 신청은 막지 않고 운영자가 보고 고른다). 신청 성별의 쌍(남성 `maleMin/MaxBirthYear`,
 * 여성 `femaleMin/MaxBirthYear` — SPEC-002 D16)과 비교하고 경계는 포함. 그 성별의 범위가 없거나 출생연도를 모르면(탈퇴 ·
 * 조회 실패) 거짓. 서버는 판정하지 않는다(표시만).
 */
export function outsideBirthYears(
  gender: Gender,
  birthYear: number | null,
  schedule: Pick<
    AdminSchedule,
    | 'maleMinBirthYear'
    | 'maleMaxBirthYear'
    | 'femaleMinBirthYear'
    | 'femaleMaxBirthYear'
  >,
): boolean {
  if (birthYear === null) {
    return false;
  }
  const [min, max] =
    gender === 'MALE'
      ? [schedule.maleMinBirthYear, schedule.maleMaxBirthYear]
      : [schedule.femaleMinBirthYear, schedule.femaleMaxBirthYear];
  return (min !== null && birthYear < min) || (max !== null && birthYear > max);
}

/** 계정 상태 칸 — 정지 · 탈퇴일 때만 보인다(4절 A10). */
export function accountNoteOf(member: MemberSummary | null): string {
  switch (member?.status) {
    case 'SUSPENDED':
      return '정지';
    case 'WITHDRAWN':
      return '탈퇴한 회원';
    default:
      return '';
  }
}

/**
 * `GET /members?ids=` 실패의 안내. 401은 세션을 끝내므로 null, 그 밖의 4xx는 코드 문구(SPEC-001 admin 규칙 — 예: 403 정지),
 * 5xx · 네트워크는 4절 표의 "회원 정보를 불러오지 못했습니다…".
 */
export function memberLookupNotice(error: unknown): string | null {
  if (error === null || error === undefined) {
    return null;
  }
  if (isApiClientError(error) && error.status < 500) {
    return error.status === 401 ? null : describeError(error);
  }
  return MEMBER_LOOKUP_FAILED_MESSAGE;
}

// ----- A8 회차 수정 · 취소 -----

type ActiveCounts = Pick<
  AdminSchedule,
  'appliedMale' | 'appliedFemale' | 'receivedMale' | 'receivedFemale'
>;

/** 활성 신청 수(남녀 합) = 자리 잡은 수 + 접수 수 — H · I 문장의 N(접수된 사람도 안내 대상이다, SPEC-003 D18). */
export function activeApplicationCount(schedule: ActiveCounts): number {
  return (
    schedule.appliedMale +
    schedule.appliedFemale +
    schedule.receivedMale +
    schedule.receivedFemale
  );
}

const NOTIFY_FIELDS = [
  'startsAt',
  'endsAt',
  'applyDeadlineAt',
  'venueArea',
  'venueName',
  'venueAddress',
  'venueDirections',
  'venueMapUrl',
  'priceMale',
  'priceFemale',
] as const satisfies readonly (keyof UpdateScheduleRequest)[];

/**
 * 저장 전 안내(H): 활성 신청이 있는 회차에서 시각 · 장소 · 참가비를 바꾸면 한 번 묻는다(경고일 뿐).
 * 신청 마감 시각을 바꾸면 본인 취소 기간도 바뀐다는 문장을 더한다(C · D4). 폼이 끝에 "이대로 저장할까요?"를 붙인다.
 */
export function applicantWarnings(
  schedule: ActiveCounts,
  changes: UpdateScheduleRequest,
): string[] {
  const count = activeApplicationCount(schedule);
  if (count === 0 || !NOTIFY_FIELDS.some((field) => field in changes)) {
    return [];
  }
  const warnings = [
    `신청자 ${count}명이 있습니다. 바뀐 내용은 신청자에게 따로 안내해 주세요. 참가비를 바꿔도 이미 한 신청의 금액은 그대로입니다.`,
  ];
  if ('applyDeadlineAt' in changes) {
    warnings.push(
      '신청 마감 시각을 바꾸면 신청자가 직접 취소할 수 있는 기간도 함께 바뀝니다.',
    );
  }
  return warnings;
}

/** 회차 취소 창에 더하는 문장(I). 활성 신청이 없으면 null. */
export function scheduleCancelApplicantsNote(
  schedule: ActiveCounts,
): string | null {
  const count = activeApplicationCount(schedule);
  return count === 0
    ? null
    : `신청 ${count}건도 함께 취소됩니다. 취소한 뒤 신청 목록에서 연락처를 확인할 수 있습니다. 신청자에게는 따로 안내해 주세요.`;
}

/**
 * A8 정원 칸의 안내(D8 — 화면 편의): 칸 값을 저장된 정원에서 바꿨고 그 성별의 신청 수보다 작을 때만. 저장을 막지 않는다 —
 * 신청 수는 화면을 연 뒤에도 바뀌므로 판정은 서버의 409가 한다.
 */
export function capacityNotice(
  value: unknown,
  applied: number,
  saved: number,
): string | undefined {
  return typeof value === 'number' && value !== saved && value < applied
    ? capacityBelowMessage(applied)
    : undefined;
}

/** 정원을 그 성별의 신청 수보다 작게 넣었을 때(폼 · 409 `CAPACITY_BELOW_APPLICATIONS` 같은 문구). */
export function capacityBelowMessage(applied: number): string {
  return `정원을 지금 신청 수(${applied}명)보다 작게 줄일 수 없습니다. 신청을 먼저 취소해 주세요.`;
}

/**
 * 409 `CAPACITY_BELOW_APPLICATIONS`의 N — 409 뒤 다시 불러온 회차에서, 보낸 정원이 신청 수보다 작은 성별의 신청 수.
 * 둘 다 작으면 남성부터. 다시 불러온 값으로도 가를 수 없으면 null(기본 문구).
 */
export function capacityConflictCount(
  sent: Pick<UpdateScheduleRequest, 'capacityMale' | 'capacityFemale'>,
  schedule: Pick<AdminSchedule, 'appliedMale' | 'appliedFemale'>,
): number | null {
  if (sent.capacityMale != null && sent.capacityMale < schedule.appliedMale) {
    return schedule.appliedMale;
  }
  if (
    sent.capacityFemale != null &&
    sent.capacityFemale < schedule.appliedFemale
  ) {
    return schedule.appliedFemale;
  }
  return null;
}

/** 운영자 신청 화면의 오류 코드 문구(SPEC-003 4절 "운영자 화면 오류 문구"). */
export const APPLICATION_ERROR_OVERRIDES: Partial<Record<string, string>> = {
  [API_ERROR_CODES.APPLICATION_NOT_FOUND]:
    '찾을 수 없는 신청입니다. 목록을 새로 고쳐 주세요.',
};

export const MEMBER_LOOKUP_FAILED_MESSAGE =
  '회원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
