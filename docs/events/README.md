# 이벤트 (Kafka)

> **현재 상태: 구조만 준비 단계.**
> 로컬 Kafka 실행 환경(docker compose profile)과 이벤트 계약(`@oneul-sai/contracts`)만 존재한다. 어떤 서비스도 아직 Kafka에 연결하지 않으며, 실제 발행/구독 코드는 비즈니스 기능 구현 단계에서 작성한다.

## 1. 이벤트 네이밍

- 이벤트 이름: `domain.event` 형식 (예: `match.created`)
- 토픽 이름: 이벤트 이름 + 버전 suffix (예: `match.created.v1`)
- 버전은 payload 스키마의 breaking change 시에만 올린다. 하위 호환 필드 추가는 같은 버전을 유지한다.

## 2. EventEnvelope 계약

모든 이벤트 메시지는 `@oneul-sai/contracts`의 `EventEnvelope`로 감싼다. Producer/Consumer가 임의 payload를 만들지 않고, contracts에 정의된 타입만 사용한다.

```ts
interface EventEnvelope<TPayload> {
  eventId: string; // 이벤트 고유 ID (중복 처리 판별 키)
  type: string; // 이벤트 이름 (예: 'match.created')
  version: number; // payload 스키마 버전
  occurredAt: string; // 발생 시각, ISO 8601
  requestId?: string; // 발행을 일으킨 요청의 x-request-id (UUID일 때만)
  payload: TPayload;
}
```

- 봉투 Zod 스키마는 `eventEnvelopeSchema(payload)`(contracts)다. 발행 쪽은 보내기 전에, 소비 쪽은 받은 뒤에 parse한다. `eventEnvelopeSchema(z.unknown())`은 payload를 보지 않고 봉투만 검사한다.
- `requestId`는 선택 필드(UUID)다. 받은 `x-request-id`가 UUID 모양일 때만 싣고, 소비자는 로그에 이어 붙인다 — 비동기 구간의 요청 추적([ADR-012](../adr/ADR-012-event-reliability.md) 결정 6, ADR-005 Trade-offs).
- 봉투 부호화 · 해석은 `@oneul-sai/kafka`의 `encodeEnvelope` · `decodeEnvelope`로만 한다([packages/kafka README](../../packages/kafka/README.md)).

## 3. 초기 이벤트 후보

실제 구현 시점에만 payload 타입을 contracts에 추가한다.

| 도메인      | 이벤트                                                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| member      | `member.created` / `member.withdrawn` — SPEC-001 8절이 예약. 발행하지 않음(SPEC-004) — `member.created`는 결정 예정 (Step 7), `member.withdrawn`은 요청이 생길 때 다시 묻는다(L-1) |
| application | `application.created` / `application.accepted` / `application.cancelled` — SPEC-003: Step 3은 발행하지 않는다. 발행하지 않음(SPEC-004) — 결정 예정 (Step 7)                        |
| payment     | `payment.completed` / `payment.failed` / `payment.cancelled`                                                                                                                       |
| event       | `event.started` / `event.completed`                                                                                                                                                |
| schedule    | `schedule.cancelled` / `schedule.changed` — SPEC-002 8절이 이름만 예약. 발행하지 않음(SPEC-004) — 결정 예정 (Step 7)                                                               |
| rotation    | `rotation.started` / `rotation.changed` / `rotation.completed`                                                                                                                     |
| preference  | `preference.submitted`                                                                                                                                                             |
| match       | `match.created`                                                                                                                                                                    |

## 4. 신뢰성

[ADR-012](../adr/ADR-012-event-reliability.md)가 정했다(첫 적용: SPEC-004 `payment.completed.v1`). 각 줄의 자세한 규칙은 ADR-012 결정 번호를 본다.

- **중복(멱등성)**: at-least-once다. 소비자는 자기 DB의 `ProcessedEvent`(`eventId` PK)를 상태 변경과 같은 트랜잭션에 넣는다 — 이미 있으면 아무것도 바꾸지 않는다. 오프셋은 DB 커밋 뒤 수동으로 커밋한다. 소비자는 그룹의 커밋된 오프셋이 없으면 **처음부터 읽고**(`fromBeginning: true`), 구독 전에 토픽을 한 번 만든다(`createTopics`, 있으면 그대로)(결정 2).
- **재시도**: 기본값은 **"커밋하지 않고 다시"** 다 — 같은 메시지를 5초 간격으로 끝없이(warn `event.retrying`, 10번째부터 error), 에러 종류를 가르지 않는다. 넘기는(커밋하는) 것은 해석할 수 없는 메시지(JSON 아님 · 봉투/payload Zod 실패 · `type` · `version` 다름 — error `event.rejected`)뿐이다. 업무 판정(이미 바뀜 · 취소됨 등)은 에러가 아니다(결정 3).
- **순서**: 토픽 사이의 순서는 없고, **같은 키 안에서도 발행 순서가 커밋 순서와 같다고 보장하지 않는다**(outbox relay는 커밋 순서를 모른다). 소비자는 도착 순서가 아니라 대상의 지금 상태로 판정한다. 파티션 키는 소비자가 대상을 찾을 키다(결정 5).
- **DLQ**: 두지 않는다. 원본이 발행한 서비스의 outbox에 남아 `publishedAt = NULL`로 재생한다 — outbox가 재생 원천이다. 외부 부수 효과가 있는 소비자(Step 7 알림)가 생길 때 다시 본다(결정 4).
- **Producer 실패**: relay가 앞 회차가 끝난 뒤 다시 보낸다(평소 1초, 실패하면 5초 뒤). 전달 제한 시간은 10초이고, 넘으면 warn `outbox.publish_failed`. 행이 남아 있는 한 유실이 없다. 서비스는 브로커 없이도 뜬다(결정 1).
- **DB Commit–Publish 정합성**: **Transactional Outbox**를 채택했다 — 발행할 이벤트를 업무 행과 같은 트랜잭션의 `OutboxEvent`에 넣고, 같은 프로세스의 폴링 relay가 잠금 없이 읽어 보낸다(결정 1).

## 5. 로컬 Kafka 실행

Kafka는 기본 `docker compose up -d`에 포함되지 않는다. 필요할 때만 profile로 실행한다.

```bash
docker compose --profile kafka up -d
```

- 브로커: `localhost:9092` (KRaft 단일 노드, 로컬 개발 전용, `KAFKA_BROKERS` 환경 변수 참고)
- 구성 상세: `infra/docker/docker-compose.kafka.yml`
