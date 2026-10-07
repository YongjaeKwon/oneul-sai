import {
  PAYMENT_COMPLETED,
  PaymentCompletedPayloadSchema,
  type EventEnvelope,
  type PaymentCompletedPayload,
} from '@oneul-sai/contracts';
import {
  buildTopicName,
  decodeEnvelope,
  encodeEnvelope,
} from '@oneul-sai/kafka';

// SPEC-004 13절 단위 "packages/kafka 부호화(event-service에서)": packages/kafka에는 vitest가 없으므로 첫 소비자가 검사한다.
// 브로커에 붙지 않는다 — 연결은 5 · 6b PR 스모크가 본다.

const envelope: EventEnvelope<PaymentCompletedPayload> = {
  eventId: '1d2e3f40-5a6b-4c7d-8e9f-a0b1c2d3e4f5',
  type: PAYMENT_COMPLETED.type,
  version: PAYMENT_COMPLETED.version,
  occurredAt: '2026-10-07T05:00:00.000Z',
  requestId: '7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b',
  payload: {
    paymentId: '9c2e7d1a-3f4b-4a5c-8d6e-7f8091a2b3c4',
    applicationId: '3b241101-e2bb-4255-8caf-4136c566a962',
    memberId: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
  },
};

const decode = (value: { toString(): string } | null) =>
  decodeEnvelope(value, PAYMENT_COMPLETED, PaymentCompletedPayloadSchema);

const encodeWith = (overrides: Record<string, unknown>) =>
  JSON.stringify({ ...envelope, ...overrides });

describe('encodeEnvelope → decodeEnvelope (SPEC-004 D8)', () => {
  it('round-trips a string and a Buffer value', () => {
    const value = encodeEnvelope(envelope);
    expect(decode(value)).toEqual({ ok: true, envelope });
    expect(decode(Buffer.from(value))).toEqual({ ok: true, envelope });
  });

  it('round-trips an envelope without requestId', () => {
    const withoutRequestId = { ...envelope, requestId: undefined };
    expect(decode(encodeEnvelope(withoutRequestId))).toEqual({
      ok: true,
      envelope: withoutRequestId,
    });
  });
});

describe('decodeEnvelope failures — { ok: false }, never throws', () => {
  it('INVALID_ENVELOPE: null value, not JSON', () => {
    for (const value of [null, '', 'not json', Buffer.from('{')]) {
      expect(decode(value)).toEqual({ ok: false, reason: 'INVALID_ENVELOPE' });
    }
  });

  it('INVALID_ENVELOPE: envelope Zod failure (no eventId — envelope unreadable)', () => {
    for (const value of [
      'null',
      '42',
      '[]',
      encodeWith({ eventId: 'not-a-uuid' }),
      encodeWith({ occurredAt: '2026-10-07 05:00' }),
      encodeWith({ version: '1' }),
    ]) {
      expect(decode(value)).toEqual({ ok: false, reason: 'INVALID_ENVELOPE' });
    }
  });

  it('INVALID_ENVELOPE: payload Zod failure keeps the readable eventId', () => {
    expect(
      decode(
        encodeWith({ payload: { paymentId: envelope.payload.paymentId } }),
      ),
    ).toEqual({
      ok: false,
      reason: 'INVALID_ENVELOPE',
      eventId: envelope.eventId,
    });
  });

  it('UNEXPECTED_TYPE before version and payload', () => {
    expect(
      decode(
        encodeWith({ type: 'payment.refunded', version: 2, payload: 'x' }),
      ),
    ).toEqual({
      ok: false,
      reason: 'UNEXPECTED_TYPE',
      eventId: envelope.eventId,
    });
  });

  it('UNKNOWN_VERSION before payload', () => {
    expect(
      decode(encodeWith({ version: 2, payload: { amount: 39_000 } })),
    ).toEqual({
      ok: false,
      reason: 'UNKNOWN_VERSION',
      eventId: envelope.eventId,
    });
  });
});

describe('buildTopicName (SPEC-004 D7)', () => {
  it('is <type>.v<version>', () => {
    expect(buildTopicName('payment.completed', 1)).toBe('payment.completed.v1');
    expect(
      buildTopicName(PAYMENT_COMPLETED.type, PAYMENT_COMPLETED.version),
    ).toBe('payment.completed.v1');
  });
});
