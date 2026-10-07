import { z } from 'zod';

// SPEC-004 7절. Prisma enum(apps/payment-service/prisma/schema.prisma)과 값이 같아야 한다.

/** 결제 상태. 입금 확인을 기록하면 COMPLETED, 환불을 기록하면 REFUNDED. */
export const PAYMENT_STATUSES = ['COMPLETED', 'REFUNDED'] as const;
export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
