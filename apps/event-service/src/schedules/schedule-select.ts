import type { Prisma } from '../generated/prisma/client.js';

// SPEC-002 12절 "비공개 장소 필드 노출 방지" 2번: Prisma `select`로 명시 선택한다.
// 공개 select에는 비공개 열(venueName · venueAddress · venueDirections · venueMapUrl · cancelReason)이 없다 —
// 공개 요청 처리 중에는 그 값이 DB에서 읽히지도 않는다. 운영자 select는 공개 select를 **넓힌다**(응답 스키마와 같은 방향).

/** 공개 열 + 상품 제목 · 설명(복사하지 않고 읽는다, D1). `src/events/`는 이것만 쓴다. */
export const PUBLIC_SCHEDULE_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  applyDeadlineAt: true,
  priceMale: true,
  priceFemale: true,
  capacityMale: true,
  capacityFemale: true,
  maleMinBirthYear: true,
  maleMaxBirthYear: true,
  venueArea: true,
  status: true,
  meetup: { select: { title: true, description: true } },
} as const satisfies Prisma.ScheduleSelect;

/** 운영자 응답용. 운영자 경로(`src/schedules/`)만 쓴다. */
export const ADMIN_SCHEDULE_SELECT = {
  ...PUBLIC_SCHEDULE_SELECT,
  meetupId: true,
  venueName: true,
  venueAddress: true,
  venueDirections: true,
  venueMapUrl: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ScheduleSelect;

export type PublicScheduleRow = Prisma.ScheduleGetPayload<{
  select: typeof PUBLIC_SCHEDULE_SELECT;
}>;
export type AdminScheduleRow = Prisma.ScheduleGetPayload<{
  select: typeof ADMIN_SCHEDULE_SELECT;
}>;

/** 행을 응답 모양으로 편다: 상품 제목 · 설명을 올리고 시각을 UTC `Z` 문자열로. 나머지 키는 그대로 둔다 — 응답 스키마가 떼어 낸다. */
export function flattenScheduleRow<T extends PublicScheduleRow>(row: T) {
  return {
    ...row,
    title: row.meetup.title,
    description: row.meetup.description,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    applyDeadlineAt: row.applyDeadlineAt.toISOString(),
  };
}
