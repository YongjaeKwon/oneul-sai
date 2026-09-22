# @oneul-sai/contracts

서비스 간 API/Event 계약만 정의하는 패키지. 비즈니스 로직은 두지 않는다.

## 계약 규칙

- Producer/Consumer가 임의 payload를 만들지 않는다. 이 패키지에 정의된 계약 타입만 사용한다.
- 이벤트 이름은 `domain.event` 형식을 따르고, `EventEnvelope`의 `version` 필드로 버저닝한다. topic은 `match.created.v1` 형태를 쓴다.
- 초기 이벤트 후보 목록은 아래와 같고, 실제 구현 시점에만 타입으로 추가한다.
  - `member.created`
  - `application.created` / `application.accepted` / `application.cancelled`
  - `payment.completed` / `payment.failed` / `payment.cancelled`
  - `event.started` / `event.completed`
  - `rotation.started` / `rotation.changed` / `rotation.completed`
  - `preference.submitted`
  - `match.created`
