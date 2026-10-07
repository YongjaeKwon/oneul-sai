import { z } from 'zod';

// SPEC-004 8절. 이벤트 이름 · 버전은 봉투(`type` · `version`)와 토픽 이름(`buildTopicName`)이 같은 상수를 쓴다.

/** 입금 확인 기록. 토픽 `payment.completed.v1`, 파티션 키 `applicationId`. */
export const PAYMENT_COMPLETED = {
  type: 'payment.completed',
  version: 1,
} as const;

/**
 * `payment.completed` v1 payload. `z.object`라 같은 버전에 더해진 필드는 떼어 내고 받는다(하위 호환, events README 1절).
 * 금액 · 이름 · 휴대폰은 싣지 않는다(D14 — 금액이 필요한 소비자가 생기면 같은 버전에 더한다).
 */
export const PaymentCompletedPayloadSchema = z.object({
  paymentId: z.uuid(),
  applicationId: z.uuid(),
  memberId: z.uuid(),
});
export type PaymentCompletedPayload = z.infer<
  typeof PaymentCompletedPayloadSchema
>;
