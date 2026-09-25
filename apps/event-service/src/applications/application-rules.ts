import {
  API_ERROR_CODES,
  type ApiErrorCode,
  type ApplicationStatus,
  type Gender,
  type ScheduleStatus,
} from '@oneul-sai/contracts';

// SPEC-003 D7 · 6절: 신청 · 취소 판정. 순수 함수(Nest · Prisma 없음) — 시각은 인자로 받는다(D4, 잠금을 얻은 뒤 읽은 `now`).
// DB를 읽는 일(잠금 · 집계)은 서비스가 하고, 여기는 읽은 값으로 결론만 낸다.

export type Rejection = {
  kind: 'reject';
  status: 404 | 409;
  code: ApiErrorCode;
};

const reject = (status: 404 | 409, code: ApiErrorCode): Rejection => ({
  kind: 'reject',
  status,
  code,
});

/** 신청 판정에 쓰는 회차 값. */
export interface ApplySchedule {
  status: ScheduleStatus;
  priceMale: number;
  priceFemale: number;
  applyDeadlineAt: Date;
  capacityMale: number;
  capacityFemale: number;
  maleMinBirthYear: number | null;
  maleMaxBirthYear: number | null;
}

export interface ApplyFacts {
  /** 잠근 회차. 없으면 null. */
  schedule: ApplySchedule | null;
  now: Date;
  applicant: { gender: Gender; birthYear: number };
  /** 이 회차에 내 활성 신청이 있다 */
  hasActiveHere: boolean;
  /** 이 회차에 운영자가 취소한 내 신청이 있다(F) */
  adminCancelledHere: boolean;
  /** 시작 전인 다른 회차의 내 입금 대기 신청 수(F) */
  pendingElsewhere: number;
  /** 이 회차 · 내 성별의 활성 신청 수 */
  activeOfMyGender: number;
}

/** 남성 연령대(출생연도 범위) 밖인가. 여성은 연령 조건이 없다(SPEC-002 D5, G). */
export function outsideMaleBirthYears(
  schedule: Pick<ApplySchedule, 'maleMinBirthYear' | 'maleMaxBirthYear'>,
  applicant: ApplyFacts['applicant'],
): boolean {
  if (applicant.gender !== 'MALE') return false;
  const { maleMinBirthYear: min, maleMaxBirthYear: max } = schedule;
  return (
    (min !== null && applicant.birthYear < min) ||
    (max !== null && applicant.birthYear > max)
  );
}

/** D7 순서의 첫 거절, 없으면 신청과 그 성별의 참가비(신청에 스냅샷으로 남긴다, D1 · H). */
export function decideApply(
  facts: ApplyFacts,
): { kind: 'apply'; price: number } | Rejection {
  const { schedule, now, applicant } = facts;
  // (1) 없음 · DRAFT · CANCELLED는 공개 상세와 같은 404
  if (
    schedule === null ||
    schedule.status === 'DRAFT' ||
    schedule.status === 'CANCELLED'
  ) {
    return reject(404, API_ERROR_CODES.SCHEDULE_NOT_FOUND);
  }
  // (2) 모집 마감 · 신청 마감 지남
  if (
    schedule.status === 'CLOSED' ||
    now.getTime() >= schedule.applyDeadlineAt.getTime()
  ) {
    return reject(409, API_ERROR_CODES.APPLICATION_CLOSED);
  }
  if (facts.hasActiveHere) return reject(409, API_ERROR_CODES.ALREADY_APPLIED);
  if (facts.adminCancelledHere) {
    return reject(409, API_ERROR_CODES.REAPPLY_NOT_ALLOWED);
  }
  if (facts.pendingElsewhere > 0) {
    return reject(409, API_ERROR_CODES.PENDING_APPLICATION_LIMIT);
  }
  if (outsideMaleBirthYears(schedule, applicant)) {
    return reject(409, API_ERROR_CODES.BIRTH_YEAR_OUT_OF_RANGE);
  }
  const male = applicant.gender === 'MALE';
  const capacity = male ? schedule.capacityMale : schedule.capacityFemale;
  if (facts.activeOfMyGender >= capacity) {
    return reject(409, API_ERROR_CODES.SCHEDULE_FULL);
  }
  return {
    kind: 'apply',
    price: male ? schedule.priceMale : schedule.priceFemale,
  };
}

/**
 * 6절 취소 전이 표. 이미 취소된 신청은 무엇도 바꾸지 않는다(200, 취소 주체도 그대로).
 * 본인 취소(`memberDeadline`)는 신청 마감 전까지 — 회차 상태는 보지 않는다(CLOSED여도 된다, C).
 * 운영자 취소(`null`)는 시각 조건이 없다.
 */
export function decideCancel(
  current: ApplicationStatus,
  memberDeadline: { applyDeadlineAt: Date; now: Date } | null,
): { kind: 'change' } | { kind: 'noop' } | Rejection {
  if (current === 'CANCELLED') return { kind: 'noop' };
  if (
    memberDeadline !== null &&
    memberDeadline.now.getTime() >= memberDeadline.applyDeadlineAt.getTime()
  ) {
    return reject(409, API_ERROR_CODES.APPLICATION_NOT_CANCELLABLE);
  }
  return { kind: 'change' };
}
