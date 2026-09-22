# API 규칙

오늘사이 백엔드 API의 공통 규칙을 정의한다. 현재는 환경 구성 단계이므로 실제 비즈니스 엔드포인트는 없으며, 여기서 정한 규칙은 이후 모든 API 구현의 기준이 된다.

## 1. 모든 외부 접근은 Gateway 경유

- 클라이언트(Web/Admin/Mobile)는 **API Gateway(:4000)** 만 호출한다. 마이크로서비스 포트(4001~4005)를 직접 호출하지 않는다.
- 마이크로서비스 직접 호출은 로컬 개발/디버깅 용도로만 허용한다.
- Gateway는 라우팅, Request ID 발급/전파, 공통 로깅, 공통 에러 정책을 담당한다.

## 2. 버저닝

- 모든 비즈니스 API는 `/api/v1` prefix를 사용한다.
  - 예: `GET /api/v1/members/{id}`
- Breaking change가 필요할 때만 `/api/v2`를 추가하고, v1은 폐기 일정 공지 후 제거한다.
- `/health`, `/docs`는 버저닝 대상이 아니다(운영/문서용 엔드포인트).

## 3. Gateway 라우팅 테이블

| 경로 prefix | 대상 서비스 | 포트 |
| --- | --- | --- |
| `/api/v1/members` | member-service | 4001 |
| `/api/v1/events` | event-service | 4002 |
| `/api/v1/applications` | event-service | 4002 |
| `/api/v1/matches` | matching-service | 4003 |
| `/api/v1/preferences` | matching-service | 4003 |
| `/api/v1/payments` | payment-service | 4005 |

- notification-service(4004)는 외부 라우팅 대상이 아니다. Kafka 이벤트를 소비해 동작하는 내부 서비스다(현재는 구조만 준비).
- 라우팅 대상 URL은 각 환경 변수(`MEMBER_SERVICE_URL` 등)로 주입한다. `.env.example` 참고.

## 4. 공통 에러 응답 계약

모든 서비스는 에러 시 `@oneul-sai/contracts`의 `ApiErrorResponse` 형태로 응답한다.

```ts
interface ApiErrorResponse {
  statusCode: number; // HTTP 상태 코드
  error: string; // 에러 분류 (예: 'Not Found', 'Bad Request')
  message: string; // 사람이 읽을 수 있는 설명
  path: string; // 요청 경로
  requestId?: string; // x-request-id 값 (있으면 반드시 포함)
  timestamp: string; // ISO 8601
}
```

예시:

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Cannot GET /api/v1/unknown",
  "path": "/api/v1/unknown",
  "requestId": "3f2b6c1e-8f0a-4c7d-9b2e-5a1d0c9e7f42",
  "timestamp": "2026-09-22T01:23:45.678Z"
}
```

- 성공 응답의 공통 래핑 여부는 실제 비즈니스 API 구현 단계에서 결정한다(현재는 미정).

## 5. Request ID

- 헤더 이름: `x-request-id`
- 클라이언트가 보내지 않으면 Gateway가 생성한다. Gateway는 다운스트림 호출 시 같은 헤더를 그대로 전달하고, 응답에도 포함한다.
- 각 서비스는 로그와 에러 응답(`requestId` 필드)에 이 값을 남긴다.
- 전파 전략의 상세는 [아키텍처 개요](../architecture/overview.md)를 참고한다.

## 6. Swagger (API 문서)

- 각 백엔드 서비스는 자체 Swagger UI를 노출한다: `http://localhost:<port>/docs`
  - 예: member-service → `http://localhost:4001/docs`
- Gateway 차원의 통합 문서는 이후 단계에서 검토한다.

## 7. Health 규약

- 모든 백엔드 서비스(Gateway 포함)는 `GET /health`를 노출한다.
- 규약: 정상일 때 HTTP `200`, JSON body에 `status: "ok"`와 서비스 식별 정보를 포함한다.
- `/health`는 인증 없이 접근 가능해야 하며, Kubernetes Liveness/Readiness Probe와 로컬 wiring 확인에 사용한다.
- Gateway의 `/health`는 Gateway 자신의 상태만 응답한다(다운스트림 상태 집계는 이후 단계에서 결정).

## 8. API 문서 운영 방식

### 8.1 원천은 Swagger다

- 각 서비스의 API 문서 원천은 코드다. `main.ts`의 `DocumentBuilder`가 서비스 제목·설명·버전을, 컨트롤러의 데코레이터(`@ApiTags`, `@ApiOperation`, `@ApiOkResponse` 등)가 엔드포인트 명세를 만든다.
- 서비스를 띄우면 `http://localhost:<port>/docs`에서 항상 최신 문서를 본다.
- 이 문서(`docs/api/README.md`)는 **규약과 인덱스**만 담는다. 요청/응답 필드를 여기에 다시 적지 않는다. Swagger와 이 문서가 다르면 Swagger가 맞다.

### 8.2 새 엔드포인트를 추가하는 절차

| 순서 | 할 일 | 어디에 |
| --- | --- | --- |
| 1 | 설계서의 "API 변경" 절에 메서드·경로·요청·응답·에러를 적는다 | `docs/specs/SPEC-00N-*.md` |
| 2 | 컨트롤러를 만들고 Swagger 데코레이터를 단다. `@ApiOperation({ summary })`는 필수 | `apps/<service>/src/**/*.controller.ts` |
| 3 | 요청/응답 스키마를 Zod로 정의하고 타입을 내보낸다 | `packages/contracts` |
| 4 | 클라이언트 함수를 추가한다 | `packages/api-client` |
| 5 | 아래 8.3 엔드포인트 인덱스 표에 한 줄을 추가한다 | 이 문서 |
| 6 | Gateway 라우팅이 필요한 새 prefix면 3절 라우팅 테이블과 `apps/api-gateway/src/proxy/routes.ts`를 함께 고친다 | 이 문서, Gateway |

변경·삭제도 같은 순서다. 삭제한 엔드포인트는 표에서 지우지 말고 상태를 "폐기"로 바꾸고 폐기 일자를 적는다. 다음 메이저 버전에서 표에서 제거한다.

### 8.3 엔드포인트 인덱스

현재는 환경 구성 단계다. 비즈니스 엔드포인트는 없고, 모든 백엔드에 `/health`와 `/docs`만 있다.

| 서비스 | 포트 | 메서드 | 경로 | 설명 | 상태 |
| --- | --- | --- | --- | --- | --- |
| api-gateway | 4000 | GET | `/health` | Gateway 프로세스 상태 | 확정 |
| api-gateway | 4000 | GET | `/docs` | Swagger UI | 확정 |
| member-service | 4001 | GET | `/health` | 서비스 상태 | 확정 |
| member-service | 4001 | GET | `/docs` | Swagger UI | 확정 |
| event-service | 4002 | GET | `/health` | 서비스 상태 | 확정 |
| event-service | 4002 | GET | `/docs` | Swagger UI | 확정 |
| matching-service | 4003 | GET | `/health` | 서비스 상태 | 확정 |
| matching-service | 4003 | GET | `/docs` | Swagger UI | 확정 |
| notification-service | 4004 | GET | `/health` | 서비스 상태 (외부 라우팅 없음) | 확정 |
| notification-service | 4004 | GET | `/docs` | Swagger UI (외부 라우팅 없음) | 확정 |
| payment-service | 4005 | GET | `/health` | 서비스 상태 | 확정 |
| payment-service | 4005 | GET | `/docs` | Swagger UI | 확정 |

비즈니스 엔드포인트는 각 Step에서 이 표에 추가한다. 예상 prefix는 3절 라우팅 테이블을 따른다(`/api/v1/members`, `/api/v1/events`, `/api/v1/applications`, `/api/v1/matches`, `/api/v1/preferences`, `/api/v1/payments`).

### 8.4 버전 정책

- 모든 비즈니스 API는 `/api/v1`로 시작한다. 2절 버저닝 규칙을 따른다.
- **하위 호환을 지키는 변경**은 v1 안에서 한다: 선택 필드 추가, 새 엔드포인트 추가, 새 enum 값 추가(클라이언트가 모르는 값을 무시하도록 만든 경우).
- **하위 호환을 깨는 변경**은 `/api/v2`를 새로 연다: 필드 삭제·이름 변경·타입 변경, 필수 필드 추가, 에러 코드 의미 변경, 경로 변경.
- v2를 열면 v1은 폐기 일정을 공지하고, 모든 클라이언트(Web/Admin/Mobile)가 옮긴 뒤 제거한다. 모바일은 배포 주기가 느리므로 여유를 둔다.
- `/health`, `/docs`는 버전을 붙이지 않는다.
- 서비스별 Swagger의 `setVersion`은 서비스 릴리스 버전이다. API 경로 버전(v1/v2)과는 다른 개념이다.

### 8.5 문서 갱신 판단

어떤 코드 변경에 어떤 문서를 고쳐야 하는지는 [문서 갱신 규칙 2절](../guides/documentation-rules.md#2-변경-유형별-갱신-표)이 원천이다. 요약은 [문서 지도의 판단표](../README.md#5-pr에서-어떤-문서를-고치나--판단표)에 있다.
