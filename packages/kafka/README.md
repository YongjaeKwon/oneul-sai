# @oneul-sai/kafka

이 패키지는 공통 Kafka 연결 설정과 Producer/Consumer 기반 코드를 담을 자리이다.
현재 스펙상 Kafka는 미구현이며, 구조만 준비하는 단계이다. 실제 Event Driven 기능
구현 단계에서 kafkajs 등 클라이언트 라이브러리를 도입한다.

각 서비스의 Event Handler 비즈니스 로직은 이 패키지에 넣지 않는다. 여기에는
연결 설정, 토픽 네이밍 규칙, Producer/Consumer 공통 래퍼 같은 인프라 코드만 둔다.

## 현재 제공하는 것

- `KafkaConnectionConfig`: 브로커 목록과 clientId를 담는 공통 연결 설정 타입
- `buildTopicName(domain, event, version)`: `<domain>.<event>.v<version>` 형식의
  토픽 네이밍 규칙 (예: `member.member-joined.v1`)

## 구현 단계에서 다시 검토할 신뢰성 주제

- 중복 메시지 처리 (idempotent consumer)
- Consumer 재시도 전략 (retry / backoff)
- 메시지 Ordering 보장 (파티션 키 설계)
- DLQ (Dead Letter Queue)
- Transactional Outbox 패턴
