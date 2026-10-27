import { z } from 'zod';

import { ApplicationStatusSchema, ScheduleStatusSchema } from './enums.js';
import {
  ADMIN_APPLICATION_LIST_PAGE_SIZE,
  ADMIN_LIST_MAX_PAGE_SIZE,
  CancelReasonSchema,
  EVENT_LIST_DEFAULT_PAGE_SIZE,
  ListPageSchema,
  MeetupDescriptionSchema,
  MeetupTitleSchema,
  MinPerGenderSchema,
  MY_APPLICATION_LIST_MAX_PAGE_SIZE,
  ParticipantConditionSchema,
  PriceNoteSchema,
  PUBLIC_SCHEDULE_LIST_MAX_PAGE_SIZE,
  SCHEDULE_BATCH_MAX,
  ScheduleBirthYearSchema,
  ScheduleCapacitySchema,
  ScheduleDateTimeSchema,
  ScheduleIdSchema,
  SchedulePriceSchema,
  VenueAddressSchema,
  VenueAreaSchema,
  VenueDirectionsSchema,
  VenueMapUrlSchema,
  VenueNameSchema,
} from './fields.js';

// SPEC-002 7절 요청 스키마. 모두 strict(모르는 필드 → 400 VALIDATION_FAILED).
// 요청 본문에는 `.default()`를 두지 않는다 — Zod 4는 `.partial()` 안의 기본값도 채우므로 PATCH가 보내지 않은 필드를 덮어쓴다.
// 빠진 선택 필드는 DB 기본값(`description` → `""`, 나머지 → NULL)이 채운다.
// 스키마가 거르지 않고 서비스가 판정하는 규칙(D14):
//   - 병합한 값의 `applyDeadlineAt ≤ startsAt < endsAt`, 진행 ≤ SCHEDULE_MAX_DURATION_MINUTES,
//     바뀌는 시각이 now 이후 · now + SCHEDULE_MAX_LEAD_DAYS 이하, → OPEN이면 applyDeadlineAt > now → 400 SCHEDULE_TIME_INVALID
//   - 병합한 값의 성별마다 min ≤ max(male* · female*BirthYear) → 400 BIRTH_YEAR_RANGE_INVALID(D16)
//   - participantCondition · priceNote · minPerGender로는 아무것도 판정하지 않는다(D17)

const hasAnyField = (value: Record<string, unknown>): boolean =>
  Object.values(value).some((field) => field !== undefined);
const NOTHING_TO_UPDATE = '바꿀 항목이 없습니다.';

// ----- 상품 -----

/** `POST /api/v1/meetups`. `description`이 없으면 `""`(DB 기본값). */
export const CreateMeetupRequestSchema = z.strictObject({
  title: MeetupTitleSchema,
  description: MeetupDescriptionSchema.optional(),
});
export type CreateMeetupRequest = z.infer<typeof CreateMeetupRequestSchema>;

/** `PATCH /api/v1/meetups/:meetupId`. 최소 한 필드. 고친 값은 그 상품의 모든 회차 응답에 반영된다(D1). */
export const UpdateMeetupRequestSchema =
  CreateMeetupRequestSchema.partial().refine(hasAnyField, {
    error: NOTHING_TO_UPDATE,
  });
export type UpdateMeetupRequest = z.infer<typeof UpdateMeetupRequestSchema>;

/** `GET /api/v1/meetups` query. 정렬은 `createdAt` 내림차순 고정. */
export const MeetupListQuerySchema = z.strictObject({
  page: ListPageSchema,
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_LIST_MAX_PAGE_SIZE)
    .default(EVENT_LIST_DEFAULT_PAGE_SIZE),
});
export type MeetupListQuery = z.infer<typeof MeetupListQuerySchema>;

// ----- 회차 (운영자) -----

/**
 * `POST /api/v1/meetups/:meetupId/schedules`. 결과는 항상 DRAFT.
 * `status` · `meetupId`(경로) · `cancelReason`, 옛 이름(`price` · `minBirthYear` · `maxBirthYear`)은 받지 않는다(strict).
 * 선택 필드(성별 연령대 넷 · 참가 조건 · 참가비 보조 문구 · 최소 인원 · 장소 안내 넷)는 없거나 `null`이면 비어 있다(D16 · D17).
 */
export const CreateScheduleRequestSchema = z.strictObject({
  startsAt: ScheduleDateTimeSchema,
  endsAt: ScheduleDateTimeSchema,
  applyDeadlineAt: ScheduleDateTimeSchema,
  priceMale: SchedulePriceSchema,
  priceFemale: SchedulePriceSchema,
  capacityMale: ScheduleCapacitySchema,
  capacityFemale: ScheduleCapacitySchema,
  maleMinBirthYear: ScheduleBirthYearSchema.nullable().optional(),
  maleMaxBirthYear: ScheduleBirthYearSchema.nullable().optional(),
  femaleMinBirthYear: ScheduleBirthYearSchema.nullable().optional(),
  femaleMaxBirthYear: ScheduleBirthYearSchema.nullable().optional(),
  participantCondition: ParticipantConditionSchema.nullable().optional(),
  priceNote: PriceNoteSchema.nullable().optional(),
  minPerGender: MinPerGenderSchema.nullable().optional(),
  venueArea: VenueAreaSchema,
  venueName: VenueNameSchema.nullable().optional(),
  venueAddress: VenueAddressSchema.nullable().optional(),
  venueDirections: VenueDirectionsSchema.nullable().optional(),
  venueMapUrl: VenueMapUrlSchema.nullable().optional(),
});
export type CreateScheduleRequest = z.infer<typeof CreateScheduleRequestSchema>;

/**
 * `POST /api/v1/meetups/:meetupId/schedules/batch`(D15). 항목 1~`SCHEDULE_BATCH_MAX`개, 각 항목은 단건과 같은 스키마.
 * 한 요청 안에서 `(startsAt이 가리키는 시각, trim한 venueArea)`가 같은 항목이 둘 이상이면 뒤 항목마다 `items.<순번>.startsAt` 이슈.
 */
export const BatchCreateSchedulesRequestSchema = z.strictObject({
  items: z
    .array(CreateScheduleRequestSchema)
    .min(1, { error: '등록할 회차가 없습니다.' })
    .max(SCHEDULE_BATCH_MAX, {
      error: `한 번에 ${SCHEDULE_BATCH_MAX}개까지 등록할 수 있습니다.`,
    })
    .superRefine((items, ctx) => {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        // offset이 달라도 같은 시각이면 같다. venueArea는 스키마가 이미 trim했다.
        const key = `${Date.parse(item.startsAt)}|${item.venueArea}`;
        if (seen.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: [index, 'startsAt'],
            message: '같은 일시 · 지역의 회차가 이미 표에 있습니다.',
          });
        }
        seen.add(key);
      });
    }),
});
export type BatchCreateSchedulesRequest = z.infer<
  typeof BatchCreateSchedulesRequestSchema
>;

/**
 * `PATCH /api/v1/meetups/:meetupId/schedules/:scheduleId`. 생성 필드가 모두 선택, 최소 한 필드.
 * 성별 연령대 넷 · 참가 조건 · 참가비 보조 문구 · 최소 인원 · 장소 안내 넷은 `null`로 비운다. `venueArea` · 시각 · 참가비 · 정원은 `null`을 받지 않는다.
 */
export const UpdateScheduleRequestSchema =
  CreateScheduleRequestSchema.partial().refine(hasAnyField, {
    error: NOTHING_TO_UPDATE,
  });
export type UpdateScheduleRequest = z.infer<typeof UpdateScheduleRequestSchema>;

/** `PATCH .../schedules/:scheduleId/status`. `DRAFT`로는 바꿀 수 없다. `cancelReason`은 `CANCELLED`일 때만, 그리고 반드시. */
export const UpdateScheduleStatusRequestSchema = z
  .strictObject({
    status: ScheduleStatusSchema.exclude(['DRAFT']),
    cancelReason: CancelReasonSchema.optional(),
  })
  .refine(
    (value) => value.status !== 'CANCELLED' || value.cancelReason !== undefined,
    { error: '취소 사유를 입력해 주세요.', path: ['cancelReason'] },
  )
  .refine(
    (value) => value.status === 'CANCELLED' || value.cancelReason === undefined,
    { error: '취소할 때만 사유를 적습니다.', path: ['cancelReason'] },
  );
export type UpdateScheduleStatusRequest = z.infer<
  typeof UpdateScheduleStatusRequestSchema
>;

/** `GET /api/v1/meetups/:meetupId/schedules` query. `startsAt`이 `[from, to)`. 정렬 `startsAt` · `id` 오름차순. */
export const AdminScheduleListQuerySchema = z
  .strictObject({
    status: ScheduleStatusSchema.optional(),
    from: ScheduleDateTimeSchema.optional(),
    to: ScheduleDateTimeSchema.optional(),
    page: ListPageSchema,
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(ADMIN_LIST_MAX_PAGE_SIZE)
      .default(EVENT_LIST_DEFAULT_PAGE_SIZE),
  })
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      Date.parse(value.from) < Date.parse(value.to),
    { error: '기간을 확인해 주세요.', path: ['to'] },
  );
export type AdminScheduleListQuery = z.infer<
  typeof AdminScheduleListQuerySchema
>;

// ----- 회차 (공개) -----

/** `GET /api/v1/events` query. OPEN · CLOSED이고 `startsAt ≥ now`, `startsAt` · `id` 오름차순. */
export const PublicScheduleListQuerySchema = z.strictObject({
  page: ListPageSchema,
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PUBLIC_SCHEDULE_LIST_MAX_PAGE_SIZE)
    .default(EVENT_LIST_DEFAULT_PAGE_SIZE),
});
export type PublicScheduleListQuery = z.infer<
  typeof PublicScheduleListQuerySchema
>;

// ----- 참가 신청 (SPEC-003 7절) -----
// 신청할 수 있는지(회차 상태 · 신청 마감 · 중복 · 재신청 금지 · 입금 대기 한도 — 정원 · 연령 검사 없음, D15), 취소할 수 있는지(D10 · SPEC-004 D10),
// 참가 가능 안내를 할 수 있는지(자리 잡은 수 < 정원, D16)는 저장된 값과 요청 시각에 따라 달라서 event-service가 판정한다.

/**
 * `POST /api/v1/applications` (MEMBER). 성별 · 참가비 · 회원 ID는 받지 않는다(모르는 필드 → 400) —
 * 서버가 회원 정보(위임 호출)와 회차에서 정한다.
 */
export const CreateApplicationRequestSchema = z.strictObject({
  scheduleId: ScheduleIdSchema,
});
export type CreateApplicationRequest = z.infer<
  typeof CreateApplicationRequestSchema
>;

/** 본인 취소 `PATCH /api/v1/applications/:applicationId/status`(회원). `CANCELLED`만, 사유 필드는 없다. */
export const UpdateApplicationStatusRequestSchema = z.strictObject({
  status: ApplicationStatusSchema.extract(['CANCELLED']),
});
export type UpdateApplicationStatusRequest = z.infer<
  typeof UpdateApplicationStatusRequestSchema
>;

/**
 * 운영자 `PATCH /api/v1/meetups/:meetupId/schedules/:scheduleId/applications/:applicationId/status`(개정 2026-10-14, D16).
 * `PENDING` = 참가 가능 안내(접수 → 입금 대기, 이때 자리를 잡는다), `CANCELLED` = 운영자 취소.
 * `APPLIED` · `CONFIRMED`는 받지 않는다(400) — 접수로 되돌리기 · 확정 만들기는 운영자 동작이 아니다(확정은 `payment.completed.v1`).
 */
export const AdminUpdateApplicationStatusRequestSchema = z.strictObject({
  status: ApplicationStatusSchema.extract(['PENDING', 'CANCELLED']),
});
export type AdminUpdateApplicationStatusRequest = z.infer<
  typeof AdminUpdateApplicationStatusRequestSchema
>;

/** `GET /api/v1/applications` query (MEMBER). 모든 상태, `createdAt` 내림차순 · `id`. */
export const MyApplicationListQuerySchema = z.strictObject({
  scheduleId: ScheduleIdSchema.optional(),
  page: ListPageSchema,
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MY_APPLICATION_LIST_MAX_PAGE_SIZE)
    .default(EVENT_LIST_DEFAULT_PAGE_SIZE),
});
export type MyApplicationListQuery = z.infer<
  typeof MyApplicationListQuerySchema
>;

/** `GET /api/v1/meetups/:meetupId/schedules/:scheduleId/applications` query (ADMIN). 신청 순(`createdAt` 오름차순 · `id`). */
export const AdminApplicationListQuerySchema = z.strictObject({
  status: ApplicationStatusSchema.optional(),
  page: ListPageSchema,
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_APPLICATION_LIST_PAGE_SIZE)
    .default(ADMIN_APPLICATION_LIST_PAGE_SIZE),
});
export type AdminApplicationListQuery = z.infer<
  typeof AdminApplicationListQuerySchema
>;
