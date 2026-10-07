import { KafkaJS } from '@confluentinc/kafka-javascript';
import { eventEnvelopeSchema, type EventEnvelope } from '@oneul-sai/contracts';
import type { Logger } from '@oneul-sai/logger';
import { z } from 'zod';

// 플랫폼 코드만 둔다(SPEC-004 D8, ADR-012): 연결 · 토픽 이름 · 봉투 부호화.
// 이벤트 종류 · payload 스키마는 contracts, outbox · relay · 소비 판정은 각 서비스에 있다.
// 클라이언트 라이브러리는 이 파일만 import한다 — 앱은 아래 타입 별칭을 쓴다.

export type KafkaProducer = KafkaJS.Producer;
export type KafkaConsumer = KafkaJS.Consumer;
export type KafkaAdmin = KafkaJS.Admin;

export interface KafkaConnectionConfig {
  brokers: string[];
  clientId: string;
}

/**
 * 클라이언트 인스턴스를 만든다(브로커 · clientId · 로그 연결). producer · consumer · admin 설정은 부르는 쪽이 넘긴다 —
 * 예: `kafka.producer({ 'message.timeout.ms': 10_000 })`(전달 제한 시간, D4),
 * `kafka.consumer({ kafkaJS: { groupId, fromBeginning: true, autoCommit: false } })`(D5 — `subscribe`에 `fromBeginning`을 주면 라이브러리가 던진다).
 */
export function createKafka(
  config: KafkaConnectionConfig,
  logger: Logger,
): KafkaJS.Kafka {
  return new KafkaJS.Kafka({
    kafkaJS: {
      brokers: config.brokers,
      clientId: config.clientId,
      logger: toKafkaLogger(logger),
    },
  });
}

/** 라이브러리 로그를 `@oneul-sai/logger`로 잇는다. 레벨 거르기는 `@oneul-sai/logger`가 하므로 `setLogLevel`은 무시한다. */
function toKafkaLogger(logger: Logger): KafkaJS.Logger {
  const adapter: KafkaJS.Logger = {
    debug: (message, extra) => logger.debug(message, { kafka: extra }),
    info: (message, extra) => logger.info(message, { kafka: extra }),
    warn: (message, extra) => logger.warn(message, { kafka: extra }),
    error: (message, extra) => logger.error(message, { kafka: extra }),
    namespace: () => adapter,
    setLogLevel: () => undefined,
  };
  return adapter;
}

/** `payment.completed`, 1 → `payment.completed.v1`. 입력은 contracts 상수뿐이라 검증하지 않는다(SPEC-004 10절). */
export function buildTopicName(type: string, version: number): string {
  return `${type}.v${version}`;
}

/** 봉투를 Kafka 메시지 value(JSON)로. */
export function encodeEnvelope<TPayload>(
  envelope: EventEnvelope<TPayload>,
): string {
  return JSON.stringify(envelope);
}

export type DecodeFailureReason =
  'INVALID_ENVELOPE' | 'UNEXPECTED_TYPE' | 'UNKNOWN_VERSION';

export type DecodeResult<TPayload> =
  | { ok: true; envelope: EventEnvelope<TPayload> }
  /** `eventId`는 봉투까지 읽혔을 때만(로그 `event.rejected`, SPEC-004 14절). */
  | { ok: false; reason: DecodeFailureReason; eventId?: string };

const headerSchema = eventEnvelopeSchema(z.unknown());

/**
 * Kafka 메시지 value(Buffer · 문자열)를 봉투로 해석한다. 던지지 않는다.
 * 순서: JSON → 봉투(payload는 아직 보지 않는다) → `type` → `version` → payload — 위조 · 결함(`type` · `version` 다름)이
 * payload 실패로 뭉개지지 않게 한다(SPEC-004 10절). 패키지는 `event`를 비교만 하고 이벤트 종류를 알지 못한다(D8).
 */
export function decodeEnvelope<TSchema extends z.ZodType>(
  value: { toString(): string } | null | undefined,
  event: { type: string; version: number },
  payloadSchema: TSchema,
): DecodeResult<z.output<TSchema>> {
  if (value === null || value === undefined) {
    return { ok: false, reason: 'INVALID_ENVELOPE' };
  }
  let json: unknown;
  try {
    json = JSON.parse(value.toString());
  } catch {
    return { ok: false, reason: 'INVALID_ENVELOPE' };
  }

  const header = headerSchema.safeParse(json);
  if (!header.success) {
    return { ok: false, reason: 'INVALID_ENVELOPE' };
  }
  const { eventId } = header.data;
  if (header.data.type !== event.type) {
    return { ok: false, reason: 'UNEXPECTED_TYPE', eventId };
  }
  if (header.data.version !== event.version) {
    return { ok: false, reason: 'UNKNOWN_VERSION', eventId };
  }

  const payload = payloadSchema.safeParse(header.data.payload);
  if (!payload.success) {
    return { ok: false, reason: 'INVALID_ENVELOPE', eventId };
  }
  return { ok: true, envelope: { ...header.data, payload: payload.data } };
}
