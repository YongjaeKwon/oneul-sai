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
