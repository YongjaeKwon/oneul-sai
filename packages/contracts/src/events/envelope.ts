import { z } from 'zod';

// 모든 Kafka 메시지의 겉싸개(docs/events/README.md 2절, SPEC-004 8절).

export interface EventEnvelope<TPayload> {
  eventId: string;
  type: string;
  version: number;
  occurredAt: string;
  /** 발행을 일으킨 요청의 `x-request-id`(UUID일 때만). 소비자 로그에 이어 붙인다. SPEC-004 */
  requestId?: string;
  payload: TPayload;
}

const IsoDateTime = z.iso.datetime();

/**
 * 봉투 Zod 스키마. 발행 쪽은 보내기 전에, 소비 쪽은 받은 뒤에 parse한다. `z.object`라 모르는 키는 떼어 낸다.
 * `eventEnvelopeSchema(z.unknown())`은 payload를 보지 않고 봉투만 검사한다 — `decodeEnvelope`가 `type` · `version`을 payload보다 먼저 볼 때 쓴다(SPEC-004 10절).
 */
export function eventEnvelopeSchema<TPayload extends z.ZodType>(
  payload: TPayload,
) {
  return z.object({
    eventId: z.uuid(),
    type: z.string().min(1),
    version: z.number().int().positive(),
    occurredAt: IsoDateTime,
    requestId: z.uuid().optional(),
    payload,
  });
}
