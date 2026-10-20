import {
  API_ERROR_CODES,
  type ApiErrorCode,
  type ApplicationStatus,
  type Gender,
  type ScheduleStatus,
} from '@oneul-sai/contracts';

// SPEC-003 D15 · D16 · 6절: 신청 · 취소 · 참가 가능 안내 판정. 순수 함수(Nest · Prisma 없음) — 시각은 인자로 받는다
// (D4, 잠금을 얻은 뒤 읽은 `now`). DB를 읽는 일(잠금 · 집계)은 서비스가 하고, 여기는 읽은 값으로 결론만 낸다.

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

/** 신청 판정에 쓰는 회차 값. 정원 · 연령대는 보지 않는다(D15). */
export interface ApplySchedule {
  status: ScheduleStatus;
  priceMale: number;
  priceFemale: number;
  applyDeadlineAt: Date;
}

export interface ApplyFacts {
  /** 잠근 회차. 없으면 null. */
  schedule: ApplySchedule | null;
  now: Date;
  applicant: { gender: Gender };
  /** 이 회차에 내 활성 신청(접수 포함)이 있다 */
  hasActiveHere: boolean;
  /** 이 회차에 운영자가 취소한 내 신청이 있다(F — 접수 단계의 취소 포함, S4) */
  adminCancelledHere: boolean;
  /** 시작 전인 다른 회차의 내 입금 대기(`PENDING`) 신청 수(F — 접수는 세지 않는다, S5) */
  pendingElsewhere: number;
}

/** D15 순서의 첫 거절, 없으면 접수와 그 성별의 참가비(신청에 스냅샷으로 남긴다, D1 · H). */
export function decideApply(
  facts: ApplyFacts,
): { kind: 'apply'; price: number } | Rejection {
  const { schedule, now } = facts;
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
  // (3) · (4) · (5) 내 상태. 정원 · 연령은 보지 않는다 — 접수는 자리를 잡지 않는다(D15, ★S1)
  if (facts.hasActiveHere) return reject(409, API_ERROR_CODES.ALREADY_APPLIED);
  if (facts.adminCancelledHere) {
    return reject(409, API_ERROR_CODES.REAPPLY_NOT_ALLOWED);
  }
  if (facts.pendingElsewhere > 0) {
    return reject(409, API_ERROR_CODES.PENDING_APPLICATION_LIMIT);
  }
  // (6) 접수
  return {
    kind: 'apply',
    price:
      facts.applicant.gender === 'MALE'
        ? schedule.priceMale
        : schedule.priceFemale,
  };
}

/**
 * 6절 취소 전이 표. 이미 취소된 신청은 무엇도 바꾸지 않는다(200, 취소 주체도 그대로). 접수는 누구든 언제든(S3).
 * 본인 취소(`memberDeadline`): 참가 확정은 못 한다(SPEC-004 D10), 입금 대기는 신청 마감 전까지 — 회차 상태는 보지 않는다(C).
 * 운영자 취소(`null`)는 상태 · 시각 조건이 없다.
 */
export function decideCancel(
  current: ApplicationStatus,
  memberDeadline: { applyDeadlineAt: Date; now: Date } | null,
): { kind: 'change' } | { kind: 'noop' } | Rejection {
  if (current === 'CANCELLED') return { kind: 'noop' };
  if (current === 'APPLIED' || memberDeadline === null) {
    return { kind: 'change' };
  }
  if (current === 'CONFIRMED') {
    return reject(409, API_ERROR_CODES.APPLICATION_CONFIRMED);
  }
  if (
    memberDeadline.now.getTime() >= memberDeadline.applyDeadlineAt.getTime()
  ) {
    return reject(409, API_ERROR_CODES.APPLICATION_NOT_CANCELLABLE);
  }
  return { kind: 'change' };
}

/**
 * 참가 가능 안내(D16): 접수 → 입금 대기, 이때 자리를 잡는다. `seatedOfGender`는 그 신청 성별의 자리 잡은 수(회차 행 잠금 뒤 별도 문장).
 * 이미 입금 대기면 아무것도 바꾸지 않는다(200). 참가 확정 · 취소는 안내할 수 없다(되살리기는 J-2).
 */
export function decideInvite(
  current: ApplicationStatus,
  seatedOfGender: number,
  capacity: number,
): { kind: 'change' } | { kind: 'noop' } | Rejection {
  if (current === 'PENDING') return { kind: 'noop' };
  if (current !== 'APPLIED') {
    return reject(409, API_ERROR_CODES.INVALID_STATUS_TRANSITION);
  }
  if (seatedOfGender >= capacity) {
    return reject(409, API_ERROR_CODES.SCHEDULE_FULL);
  }
  return { kind: 'change' };
}
