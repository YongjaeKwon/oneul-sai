import type {
  ApplicationStatus,
  Gender,
  Prisma,
} from '../generated/prisma/client.js';

// SPEC-003 10절. `Application` 테이블 접근은 applications 모듈이 소유한다 — 회차 모듈은 이 함수만 부른다(D8).
// Nest provider가 아니라 트랜잭션 클라이언트를 받는 함수라 schedules ↔ applications 사이에 모듈 순환이 없다.
// 생성 선택자 `scheduleId_memberId`는 쓰지 않는다 — CANCELLED 행이 같은 쌍에 여럿일 수 있다(9절, 기술 스택 함정 11).
// 집합은 둘이다(D14): 활성(취소 아님 — 중복 방지 · 연쇄 취소 · 내 신청)과 자리 잡은(PENDING · CONFIRMED — 정원 집계).

/** 활성 신청 = 취소되지 않은 신청(접수 포함). 중복 방지 · 재신청 금지 · 회차 취소 연쇄가 쓴다(D14). */
export const ACTIVE_APPLICATION_WHERE = {
  status: { not: 'CANCELLED' },
} as const satisfies Prisma.ApplicationWhereInput;

/** `ACTIVE_APPLICATION_WHERE`와 같은 조건을 이미 읽은 행에 적용한다. 활성 조건을 바꾸면 둘을 함께 바꾼다. */
export function isActive(status: ApplicationStatus): boolean {
  return status !== 'CANCELLED';
}

/** 자리 잡은 상태 — 허용 목록이다. 자리를 잡는 상태를 더하면 여기에만 더한다(D14). */
export const SEATED_STATUSES = ['PENDING', 'CONFIRMED'] as const;

/** 자리 잡은 신청 = 입금 대기 · 참가 확정. 정원 집계 · `maleFull` · `CAPACITY_BELOW_APPLICATIONS`가 쓴다(D14). */
export const SEATED_APPLICATION_WHERE = {
  status: { in: [...SEATED_STATUSES] },
} as const satisfies Prisma.ApplicationWhereInput;

/** `SEATED_APPLICATION_WHERE`와 같은 조건을 이미 읽은 행에 적용한다. */
export function isSeated(status: ApplicationStatus): boolean {
  return (SEATED_STATUSES as readonly ApplicationStatus[]).includes(status);
}

type ApplicationDb = Pick<Prisma.TransactionClient, 'application'>;

/** 그 회차 · 그 성별의 자리 잡은 신청 수. 회차 행을 잠근 **뒤에 별도 문장**으로 부른다(D3 · D16 — 잠금 문장의 서브쿼리가 아니다). */
export function countSeated(
  tx: ApplicationDb,
  scheduleId: string,
  gender: Gender,
): Promise<number> {
  return tx.application.count({
    where: { scheduleId, gender, ...SEATED_APPLICATION_WHERE },
  });
}

/**
 * 회차 취소의 연쇄 취소(D8): 그 회차의 활성 신청(접수 포함)을 모두 CANCELLED(`SCHEDULE`)로 — 조건을 담은 UPDATE 한 문장이다.
 * 회원 취소가 먼저 잡은 행은 기다린 뒤 조건을 다시 평가해 건너뛴다(11절). 취소한 수를 돌려준다.
 */
export async function cancelActiveForSchedule(
  tx: ApplicationDb,
  scheduleId: string,
): Promise<number> {
  const { count } = await tx.application.updateMany({
    where: { scheduleId, ...ACTIVE_APPLICATION_WHERE },
    data: { status: 'CANCELLED', cancelledBy: 'SCHEDULE' },
  });
  return count;
}

export type ApplicationCounts = Readonly<{
  /** 자리 잡은 수(PENDING · CONFIRMED) */
  appliedMale: number;
  appliedFemale: number;
  /** 접수 수(APPLIED) */
  receivedMale: number;
  receivedFemale: number;
}>;

export interface ScheduleSeats extends ApplicationCounts {
  maleFull: boolean;
  femaleFull: boolean;
}

/** 신청이 없는 회차(새 회차) — 쿼리 없이 쓴다. */
export const NO_APPLICATIONS: ApplicationCounts = {
  appliedMale: 0,
  appliedFemale: 0,
  receivedMale: 0,
  receivedFemale: 0,
};

/**
 * 회차별 성별 자리 잡은 수 · 접수 수 — `groupBy(scheduleId, gender, status)` 한 번(D17). 활성 행만 읽고 상태로 가른다.
 * 신청이 없는 회차는 결과에 없다.
 */
export async function seatCountsBySchedule(
  db: ApplicationDb,
  scheduleIds: readonly string[],
): Promise<Map<string, ApplicationCounts>> {
  const counts = new Map<string, ApplicationCounts>();
  if (scheduleIds.length === 0) return counts;
  const groups = await db.application.groupBy({
    by: ['scheduleId', 'gender', 'status'],
    where: {
      scheduleId: { in: [...scheduleIds] },
      ...ACTIVE_APPLICATION_WHERE,
    },
    _count: { _all: true },
  });
  for (const group of groups) {
    const entry = { ...(counts.get(group.scheduleId) ?? NO_APPLICATIONS) };
    const seated = isSeated(group.status);
    const male = group.gender === 'MALE';
    if (seated && male) entry.appliedMale += group._count._all;
    else if (seated) entry.appliedFemale += group._count._all;
    else if (male) entry.receivedMale += group._count._all;
    else entry.receivedFemale += group._count._all;
    counts.set(group.scheduleId, entry);
  }
  return counts;
}

/** 신청 수와 정원으로 여섯 값을 만든다. 성별 자리 마감 = 자리 잡은 수 ≥ 정원(D17) — 접수는 세지 않는다. */
export function seatsOf(
  schedule: { capacityMale: number; capacityFemale: number },
  counts: ApplicationCounts = NO_APPLICATIONS,
): ScheduleSeats {
  return {
    ...counts,
    maleFull: counts.appliedMale >= schedule.capacityMale,
    femaleFull: counts.appliedFemale >= schedule.capacityFemale,
  };
}
