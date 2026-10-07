# @oneul-sai/kafka

서비스가 함께 쓰는 Kafka 플랫폼 코드. 클라이언트 연결, 토픽 이름 규칙, 이벤트 봉투(`EventEnvelope`)의 부호화 · 해석을 담는다. 업무 규칙은 담지 않는다. 결정과 근거는 [ADR-012](../../docs/adr/ADR-012-event-reliability.md)(ADR-010 결정 1 · 6을 넓힘), 설계는 [SPEC-004](../../docs/specs/SPEC-004-payment.md) D8 · 10절 "내부 구조".

## 클라이언트

`@confluentinc/kafka-javascript` `1.10.1`(정확히 고정, librdkafka 2.15.1 기반)의 KafkaJS 호환 API(`KafkaJS`)를 쓴다. 이 패키지에만 설치하고, 라이브러리는 `src/index.ts`만 import한다 — 앱은 아래 타입 별칭을 쓰고 라이브러리를 의존성에 두지 않는다. 네이티브 애드온이라 `pnpm-workspace.yaml`의 `allowBuilds`가 필요하다 — 설치 · 업그레이드의 함정은 [기술 스택](../../docs/architecture/tech-stack.md) 함정 12.

## 제공하는 것

- `KafkaConnectionConfig`: 브로커 목록과 clientId.
- `createKafka(config, logger)`: 클라이언트 인스턴스(브로커 · clientId · `@oneul-sai/logger` 로그 연결). producer · consumer · admin 설정(전달 제한 시간, 소비자 그룹 · `fromBeginning` · `autoCommit`)은 부르는 쪽이 넘긴다.
- `buildTopicName(type, version)`: `<type>.v<version>` 형식의 토픽 이름(예: `buildTopicName('payment.completed', 1)` → `payment.completed.v1`, [이벤트 네이밍](../../docs/events/README.md) 1절). 입력은 contracts 상수뿐이라 검증하지 않는다.
- `encodeEnvelope(envelope)`: 봉투를 메시지 value(JSON)로.
- `decodeEnvelope(value, event, payloadSchema)`: 메시지 value를 봉투로 해석한다 → `{ ok: true, envelope }` 또는 `{ ok: false, reason, eventId? }`(던지지 않는다, `eventId`는 봉투까지 읽혔을 때만). 순서는 JSON → 봉투 → `type` → `version` → payload이고, 실패 이유는 `INVALID_ENVELOPE` · `UNEXPECTED_TYPE` · `UNKNOWN_VERSION`이다. 기대하는 `{ type, version }`은 부르는 쪽이 contracts 상수로 넘긴다 — 패키지는 값을 비교만 하고 이벤트 종류를 알지 못한다.
- 타입 별칭 `KafkaProducer` · `KafkaConsumer` · `KafkaAdmin`(라이브러리 타입을 다시 내보낸다).

payload Zod 스키마 · 이벤트 이름 · 버전 상수는 `@oneul-sai/contracts`에 있다. outbox 테이블 · relay · 소비 판정은 각 서비스에 둔다.

## 편입 기준

ADR-010 결정 3의 네 기준을 이 패키지에 맞춰 적었다 — 기준 3의 프로토콜은 contracts의 봉투(SPEC-004 D8 "이벤트 종류를 알지 못한다"), 기준 4의 해석은 ADR-012 결정 7. 이 패키지에 코드를 더하기 전에 네 가지를 모두 확인한다.

1. DB · Prisma를 쓰지 않는다 — `eslint.config.js`의 `no-restricted-imports`가 `@prisma/*`를 막는다.
2. env를 읽지 않는다 — 브로커 · clientId 같은 값은 앱이 `createKafka`로 넘긴다. `eslint.config.js`의 `no-restricted-properties`가 `process.env`를 막는다.
3. contracts가 정한 봉투 프로토콜 밖의 도메인 enum을 import하거나 이벤트 종류로 분기하지 않는다.
4. 한 서비스만 쓰는 코드(예: relay 루프, 소비 루프)는 넣지 않는다 — 두 서비스 이상이 같은 동작을 요구할 때만 옮긴다. 한 프로토콜의 양 끝(봉투 부호화 · 해석, 같은 연결 설정)은 한 동작으로 본다(ADR-012).

`eslint.config.js`의 두 규칙은 service-kit과 같다(메시지만 이 패키지에 맞췄다).

## 신뢰성

멱등 소비자(`ProcessedEvent`), 처음부터 읽기, 소비 실패 분류(기본은 다시 시도), DLQ 없음(outbox 재생), 순서, transactional outbox는 [ADR-012](../../docs/adr/ADR-012-event-reliability.md)와 [이벤트 문서](../../docs/events/README.md) 4절에 있다. 이 패키지가 맡는 것은 그중 "해석 불가" 판정(`decodeEnvelope`의 `ok: false`)뿐이다.
