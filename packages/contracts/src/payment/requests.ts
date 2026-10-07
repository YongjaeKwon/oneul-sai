import { z } from 'zod';

import { ApplicationIdSchema } from '../event/fields.js';
import { MemberIdSchema } from '../member/fields.js';
import { PaymentStatusSchema } from './enums.js';
import { PAYMENT_LIST_IDS_MAX, PaymentAmountSchema } from './fields.js';

// SPEC-004 7절 요청 스키마. 모두 strict(모르는 필드 → 400 VALIDATION_FAILED). 전부 운영자(ADMIN) 경로다.
// 스키마가 거르지 않고 서비스 · DB가 판정하는 규칙:
//   - 이 신청에 결제 기록이 이미 있음 → 409 PAYMENT_ALREADY_RECORDED(유일 제약)
//   - 환불할 수 없음(없는 결제 · 이미 환불 · 받은 금액 초과) → 409 PAYMENT_NOT_REFUNDABLE(조건을 담은 UPDATE)
// payment-service는 신청이 있는지 · 입금 대기인지 모른다 — 소비자(event-service)가 판정한다(D3).

/** `POST /api/v1/payments`. 입금 확인 기록. `status` · 기록자는 받지 않는다(서버가 COMPLETED · 호출자로 채운다). */
export const CreatePaymentRequestSchema = z.strictObject({
  applicationId: ApplicationIdSchema,
  memberId: MemberIdSchema,
  amount: PaymentAmountSchema,
});
export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;

/** `PATCH /api/v1/payments/:paymentId/status`. 환불 기록 — 바꿀 수 있는 상태는 REFUNDED뿐이다. */
export const UpdatePaymentStatusRequestSchema = z.strictObject({
  status: PaymentStatusSchema.extract(['REFUNDED']),
  refundAmount: PaymentAmountSchema,
});
export type UpdatePaymentStatusRequest = z.infer<
  typeof UpdatePaymentStatusRequestSchema
>;

/**
 * `GET /api/v1/payments` query. 쉼표로 이은 신청 ID 1~`PAYMENT_LIST_IDS_MAX`개뿐이다(`MemberListQuery.ids`와 같은 규칙).
 * 페이지 필드는 없다 — 신청당 결제는 하나라 결과 수가 요청한 ID 수를 넘지 않는다. 없는 ID는 결과에서 빠진다.
 */
export const AdminPaymentListQuerySchema = z.strictObject({
  applicationIds: z
    .string()
    .transform((value) => value.split(','))
    // 개수를 먼저 본다 — 쉼표만 길게 이은 값이 조각마다 이슈를 만들지 않게(앞 단계가 실패하면 뒤 단계는 돌지 않는다)
    .pipe(z.array(z.string()).max(PAYMENT_LIST_IDS_MAX))
    .pipe(z.array(z.uuid()).min(1)),
});
export type AdminPaymentListQuery = z.infer<typeof AdminPaymentListQuerySchema>;
