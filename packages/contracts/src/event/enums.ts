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

// SPEC-003 7절. Prisma enum과 값이 같아야 한다. 입금 확인 뒤의 상태(참가 확정)는 Step 4(SPEC-004)가 더한다.

/** 신청 상태. 신청하면 PENDING(입금 대기)이고 그때 그 성별의 자리를 잡는다. */
export const APPLICATION_STATUSES = ['PENDING', 'CANCELLED'] as const;
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
