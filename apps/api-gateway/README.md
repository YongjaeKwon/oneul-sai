# @oneul-sai/api-gateway

외부 Client의 단일 진입점. 비즈니스 로직을 두지 않는다.

## 역할

- **단일 진입점**: 모든 외부 요청은 게이트웨이(포트 4000)를 통해서만 내부 서비스에 도달한다.
- **라우팅**: `/api/v1/**` 요청을 경로 기준으로 내부 서비스에 프록시한다.
- **Request ID**: `x-request-id` 헤더가 없으면 생성하고, 응답 헤더와 내부 서비스로의 요청에 항상 전파한다.
- **공통 로깅/에러 정책**: 요청 완료 로그(method, url, statusCode, durationMs, requestId)와 전역 예외 필터(`ApiErrorResponse` 계약)를 적용한다.
- 인증 전달(Authentication passthrough)과 Rate Limit은 향후 단계에서 추가한다.

## 라우팅 테이블

| Path | 대상 서비스 |
| --- | --- |
| `/api/v1/members/**` | member-service (4001) |
| `/api/v1/events/**` | event-service (4002) |
| `/api/v1/applications/**` | event-service (4002) |
| `/api/v1/matches/**` | matching-service (4003) |
| `/api/v1/preferences/**` | matching-service (4003) |
| `/api/v1/payments/**` | payment-service (4005) |

notification-service는 외부 API를 노출하지 않는다(이벤트 기반).

## 실행 방법

```bash
# 루트에서
pnpm install

# 개발 서버 (watch)
pnpm --filter @oneul-sai/api-gateway dev

# 빌드 후 실행
pnpm --filter @oneul-sai/api-gateway build
pnpm --filter @oneul-sai/api-gateway start
```

## 환경 변수

`.env.example`를 복사해 `.env`를 만든다.

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `4000` | 게이트웨이 포트 |
| `MEMBER_SERVICE_URL` | `http://localhost:4001` | member-service 주소 |
| `EVENT_SERVICE_URL` | `http://localhost:4002` | event-service 주소 |
| `MATCHING_SERVICE_URL` | `http://localhost:4003` | matching-service 주소 |
| `NOTIFICATION_SERVICE_URL` | `http://localhost:4004` | notification-service 주소(외부 라우팅 없음) |
| `PAYMENT_SERVICE_URL` | `http://localhost:4005` | payment-service 주소 |

## Swagger

- http://localhost:4000/docs

## Health

- `GET http://localhost:4000/health`
