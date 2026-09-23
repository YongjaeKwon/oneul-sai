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
  payload: TPayload;
}
```

## 3. 초기 이벤트 후보

실제 구현 시점에만 payload 타입을 contracts에 추가한다.

| 도메인      | 이벤트                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| member      | `member.created` / `member.withdrawn` — SPEC-001 8절이 예약. 발행 시점 · outbox 여부는 결정 예정 (Step 4)            |
| application | `application.created` / `application.accepted` / `application.cancelled`                                             |
| payment     | `payment.completed` / `payment.failed` / `payment.cancelled`                                                         |
| event       | `event.started` / `event.completed`                                                                                  |
| schedule    | `schedule.cancelled` / `schedule.changed` — SPEC-002 8절이 이름만 예약. 발행 여부 · payload는 결정 예정 (Step 3 · 7) |
| rotation    | `rotation.started` / `rotation.changed` / `rotation.completed`                                                       |
| preference  | `preference.submitted`                                                                                               |
| match       | `match.created`                                                                                                      |

## 4. 신뢰성 고려사항

아래 항목은 실제 구현 단계에서 적용 여부와 방식을 결정한다. 지금 단계에서는 결정하지 않고, 설계 시 반드시 검토해야 할 목록으로만 관리한다.

- **중복(멱등성)**: Kafka는 at-least-once가 기본이므로 Consumer는 `eventId` 기준으로 멱등하게 처리해야 한다.
- **재시도**: Consumer 처리 실패 시 재시도 정책(횟수, backoff)과 재시도 불가 에러의 구분이 필요하다.
- **순서**: 순서가 중요한 이벤트는 파티션 키(예: memberId, eventId 단위)로 같은 파티션에 보내야 한다. 파티션 간 순서는 보장되지 않는다.
- **DLQ**: 재시도로 해소되지 않는 메시지는 Dead Letter Queue 토픽으로 격리하고 별도 처리한다.
- **Producer 실패**: 발행 실패 시의 에러 처리(재시도, 로깅, 유실 허용 여부)를 이벤트별로 정의해야 한다.
- **DB Commit–Publish 정합성**: DB 트랜잭션 커밋과 이벤트 발행 사이의 원자성이 없으면 "커밋됐지만 발행 안 됨" 또는 그 반대가 생긴다. 해결책으로 **Transactional Outbox** 패턴을 후보로 두며, 도입 여부는 실제 구현 단계에서 결정한다.

## 5. 로컬 Kafka 실행

Kafka는 기본 `docker compose up -d`에 포함되지 않는다. 필요할 때만 profile로 실행한다.

```bash
docker compose --profile kafka up -d
```

- 브로커: `localhost:9092` (KRaft 단일 노드, 로컬 개발 전용, `KAFKA_BROKERS` 환경 변수 참고)
- 구성 상세: `infra/docker/docker-compose.kafka.yml`
