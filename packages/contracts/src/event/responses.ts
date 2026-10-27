import { z } from 'zod';

import { GenderSchema } from '../member/enums.js';
import {
  ApplicationCancelledBySchema,
  ApplicationStatusSchema,
  PublicScheduleStatusSchema,
  ScheduleStatusSchema,
} from './enums.js';

// SPEC-002 7절 응답 스키마. 응답은 `z.object`(모르는 키를 떼어 낸다) — `strictObject`는 요청용이다(12절).
// 요청 규칙(범위 · 길이 · 지도 링크 호스트)을 재사용하지 않는다 — 규칙이 바뀌어도 저장된 값 때문에 조회가 500이 되지 않게.
// 시각은 UTC `Z`(`toISOString()`).

const IsoDateTime = z.iso.datetime();

const listOf = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  });

/** 모임 상품(운영자 응답). */
export const MeetupSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Meetup = z.infer<typeof MeetupSchema>;

/** `GET /api/v1/meetups`. */
export const MeetupListResponseSchema = listOf(MeetupSchema);
export type MeetupListResponse = z.infer<typeof MeetupListResponseSchema>;

/**
 * 공개 응답(`/api/v1/events`) — 이 필드뿐이다. 제목 · 설명은 상품에서 읽는다.
 * `meetupId` · 장소 안내 넷 · `cancelReason` · `createdAt` · `updatedAt` · `minPerGender`는 없다(D4 · D9 · D17).
 * 신청 관련 필드(`maleFull` 등)도 없다 — 참가자에게 남은 자리를 보이지 않는다(SPEC-003 D17, ★S2).
 */
export const PublicScheduleSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  applyDeadlineAt: IsoDateTime,
  priceMale: z.number().int(),
  priceFemale: z.number().int(),
  capacityMale: z.number().int(),
  capacityFemale: z.number().int(),
  maleMinBirthYear: z.number().int().nullable(),
  maleMaxBirthYear: z.number().int().nullable(),
  femaleMinBirthYear: z.number().int().nullable(),
  femaleMaxBirthYear: z.number().int().nullable(),
  /** 참가 조건 문구 · 참가비 보조 문구(D17 · D20). */
  participantCondition: z.string().nullable(),
  priceNote: z.string().nullable(),
  venueArea: z.string(),
  status: PublicScheduleStatusSchema,
});
export type PublicSchedule = z.infer<typeof PublicScheduleSchema>;

/** `GET /api/v1/events`. */
export const PublicScheduleListResponseSchema = listOf(PublicScheduleSchema);
export type PublicScheduleListResponse = z.infer<
  typeof PublicScheduleListResponseSchema
>;

/**
 * 운영자 응답(`/api/v1/meetups/:meetupId/schedules/**`). 공개 스키마를 **넓힌다** — 그 반대(`omit`)로 만들면
 * 운영자 쪽에 새 비공개 필드를 더할 때 omit 목록을 빠뜨리는 순간 공개 응답에 새어 나간다(7절).
 */
export const AdminScheduleSchema = PublicScheduleSchema.extend({
  status: ScheduleStatusSchema,
  meetupId: z.uuid(),
  venueName: z.string().nullable(),
  venueAddress: z.string().nullable(),
  venueDirections: z.string().nullable(),
  venueMapUrl: z.string().nullable(),
  cancelReason: z.string().nullable(),
  /** 성별 최소 인원. 운영자 응답에만 있다 — 공개 응답에 싣지 않는다(D17 · D20). */
  minPerGender: z.number().int().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  /** 성별 **자리 잡은** 신청 수(`PENDING` · `CONFIRMED`). 이름은 그대로, 뜻만 좁혔다(SPEC-003 D17). */
  appliedMale: z.number().int().min(0),
  appliedFemale: z.number().int().min(0),
  /** 성별 접수 수(`APPLIED` — 아직 자리를 잡지 않은 신청). 운영자가 참가 가능 안내를 고를 풀(SPEC-003 D17). */
  receivedMale: z.number().int().min(0),
  receivedFemale: z.number().int().min(0),
  /** 자리 잡은 수 ≥ 정원. 운영자 응답에만 있다(SPEC-003 D17, ★S2). */
  maleFull: z.boolean(),
  femaleFull: z.boolean(),
});
export type AdminSchedule = z.infer<typeof AdminScheduleSchema>;

/** `GET /api/v1/meetups/:meetupId/schedules`. */
export const AdminScheduleListResponseSchema = listOf(AdminScheduleSchema);
export type AdminScheduleListResponse = z.infer<
  typeof AdminScheduleListResponseSchema
>;

/** `POST .../schedules/batch` 201(D15). 요청 `items`와 같은 순서, 전부 DRAFT. 페이지 필드 없음. */
export const BatchCreateSchedulesResponseSchema = z.object({
  items: z.array(AdminScheduleSchema),
});
export type BatchCreateSchedulesResponse = z.infer<
  typeof BatchCreateSchedulesResponseSchema
>;

// ----- 참가 신청 (SPEC-003 7절) -----

/**
 * 회원 응답. 회차는 공개 필드만 싣는다 — 정확한 장소 안내는 없다.
 * `schedule.status`는 전체 `ScheduleStatus`다(취소된 회차의 신청도 보인다). `memberId` · `gender`는 싣지 않는다.
 */
export const MyApplicationSchema = z.object({
  id: z.uuid(),
  scheduleId: z.uuid(),
  status: ApplicationStatusSchema,
  cancelledBy: ApplicationCancelledBySchema.nullable(),
  price: z.number().int(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  schedule: z.object({
    title: z.string(),
    startsAt: IsoDateTime,
    endsAt: IsoDateTime,
    applyDeadlineAt: IsoDateTime,
    venueArea: z.string(),
    status: ScheduleStatusSchema,
  }),
});
export type MyApplication = z.infer<typeof MyApplicationSchema>;

/** `GET /api/v1/applications`. */
export const MyApplicationListResponseSchema = listOf(MyApplicationSchema);
export type MyApplicationListResponse = z.infer<
  typeof MyApplicationListResponseSchema
>;

/** 운영자 응답. 이름 · 휴대폰은 없다 — admin이 member API(`ids`)로 붙인다(D11). */
export const AdminApplicationSchema = z.object({
  id: z.uuid(),
  scheduleId: z.uuid(),
  memberId: z.uuid(),
  gender: GenderSchema,
  price: z.number().int(),
  status: ApplicationStatusSchema,
  cancelledBy: ApplicationCancelledBySchema.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AdminApplication = z.infer<typeof AdminApplicationSchema>;

/** `GET /api/v1/meetups/:meetupId/schedules/:scheduleId/applications`. */
export const AdminApplicationListResponseSchema = listOf(
  AdminApplicationSchema,
);
export type AdminApplicationListResponse = z.infer<
  typeof AdminApplicationListResponseSchema
>;
