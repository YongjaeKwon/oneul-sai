import { z } from 'zod';

// SPEC-004 7절 "요청 · 응답 필드"의 필드 규칙. 요청 스키마(requests.ts)가 조합해 쓴다.
// 상한은 모두 입력 실수 방지이며 제품 정책이 아니다. 에러 message에는 입력값을 되돌려 주지 않는다.
// 받은 금액과 참가비의 차이, 환불 금액 ≤ 받은 금액은 판정하지 않는다 — 앞은 운영자 화면 · 대사 점검(D14),
// 뒤는 payment-service의 조건을 담은 UPDATE와 DB CHECK가 본다.

/**
 * 받은 금액 · 환불 금액(원). 참가비 상한(`PRICE_MAX`)과 같은 값이지만 payment 쪽 상수다 — event의 상수를 가져오지 않는다
 * (SPEC-002 D5처럼 도메인마다 따로). 참가비 상한이 바뀌어도 이미 받은 금액의 기록 규칙이 따라 움직이지 않게.
 */
export const PAYMENT_AMOUNT_MIN = 0;
export const PAYMENT_AMOUNT_MAX = 1_000_000;

/** 결제 조회 한 번에 넘기는 신청 ID 수 상한. 운영자 신청 목록 한 페이지(최대 100건)를 한 번에 합친다. */
export const PAYMENT_LIST_IDS_MAX = 100;

/** 받은 금액 · 환불 금액(원, 정수). 0원 신청도 같은 입금 확인으로 기록한다(★E). */
export const PaymentAmountSchema = z
  .number({ error: '금액을 입력해 주세요.' })
  .int({ error: '금액은 원 단위 정수로 입력해 주세요.' })
  .min(PAYMENT_AMOUNT_MIN, { error: '금액을 확인해 주세요.' })
  .max(PAYMENT_AMOUNT_MAX, { error: '금액을 확인해 주세요.' });

/** 경로의 `:paymentId`. UUID가 아니면 400 `VALIDATION_FAILED`. */
export const PaymentIdSchema = z.uuid({ error: '결제 ID 형식이 아닙니다.' });
