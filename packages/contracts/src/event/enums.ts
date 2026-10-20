import { z } from 'zod';

// SPEC-002 7절 "공통 enum". Prisma enum(apps/event-service/prisma/schema.prisma)과 값이 같아야 한다.
// 행사를 마친 상태는 Step 5(SPEC-005)가 값과 전이를 함께 더한다(D8).

export const SCHEDULE_STATUSES = [
  'DRAFT',
  'OPEN',
  'CLOSED',
  'CANCELLED',
] as const;
export const ScheduleStatusSchema = z.enum(SCHEDULE_STATUSES);
export type ScheduleStatus = z.infer<typeof ScheduleStatusSchema>;

/** 참가자 공개 경로에 나오는 상태. DRAFT · CANCELLED는 공개 목록 · 상세에 없다(404). */
export const PUBLIC_SCHEDULE_STATUSES = ['OPEN', 'CLOSED'] as const;
export const PublicScheduleStatusSchema = z.enum(PUBLIC_SCHEDULE_STATUSES);
export type PublicScheduleStatus = z.infer<typeof PublicScheduleStatusSchema>;

// SPEC-003 7절(개정 2026-10-14). Prisma enum과 값 · **순서**가 같아야 한다.
// 순서가 선언 순이 아닌 이유: CONFIRMED(SPEC-004 D2) · APPLIED(SPEC-003 D14)는 `ALTER TYPE … ADD VALUE`로 더해져
// PostgreSQL enum 끝에 붙는다(SPEC-003 D19). schema.prisma도 같은 순서.

/**
 * 신청 상태. 신청은 APPLIED(접수 — 자리 없음)로 태어나고, 운영자 "참가 가능 안내"로 PENDING(입금 대기 — 이때 자리를 잡는다),
 * 입금 확인으로 CONFIRMED(참가 확정)가 된다. 어디서든 CANCELLED.
 * 활성 신청 = `status <> 'CANCELLED'`, 자리 잡은 신청 = `PENDING` · `CONFIRMED`(SPEC-003 D14).
 */
export const APPLICATION_STATUSES = [
  'PENDING',
  'CANCELLED',
  'CONFIRMED',
  'APPLIED',
] as const;
export const ApplicationStatusSchema = z.enum(APPLICATION_STATUSES);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

/** 취소 주체 — 본인, 운영자, 회차 취소에 따른 연쇄 취소. CANCELLED일 때만 값이 있다. */
export const APPLICATION_CANCELLED_BY = [
  'MEMBER',
  'ADMIN',
  'SCHEDULE',
] as const;
export const ApplicationCancelledBySchema = z.enum(APPLICATION_CANCELLED_BY);
export type ApplicationCancelledBy = z.infer<
  typeof ApplicationCancelledBySchema
>;
