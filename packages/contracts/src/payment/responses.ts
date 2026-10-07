import { z } from 'zod';

import { PaymentStatusSchema } from './enums.js';

// SPEC-004 7절 응답 스키마. 응답은 `z.object`(모르는 키를 떼어 낸다)이고 요청 규칙(금액 범위)을 재사용하지 않는다.
// 시각은 UTC `Z`(`toISOString()`).

const IsoDateTime = z.iso.datetime();

/** 운영자 응답. 이름 · 휴대폰은 없다 — admin이 신청 목록 · member API로 붙인다. */
export const AdminPaymentSchema = z.object({
  id: z.uuid(),
  applicationId: z.uuid(),
  memberId: z.uuid(),
  amount: z.number().int(),
  status: PaymentStatusSchema,
  recordedBy: z.uuid(),
  refundAmount: z.number().int().nullable(),
  refundedBy: z.uuid().nullable(),
  refundedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AdminPayment = z.infer<typeof AdminPaymentSchema>;

/** `GET /api/v1/payments`. 공통 목록 형식(`total` · `page` · `pageSize`)의 예외 — ID 조회 전용. 정렬 `createdAt` · `id`. */
export const AdminPaymentListResponseSchema = z.object({
  items: z.array(AdminPaymentSchema),
});
export type AdminPaymentListResponse = z.infer<
  typeof AdminPaymentListResponseSchema
>;
