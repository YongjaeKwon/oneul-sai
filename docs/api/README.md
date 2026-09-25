# API 규칙

오늘사이 백엔드 API의 공통 규칙과 엔드포인트 인덱스다. 요청 · 응답 필드는 여기에 다시 적지 않는다 — 원천은 각 서비스의 Swagger(8.1절)와 `packages/contracts`의 Zod 스키마다.

- 상태: 확정
- 최종 갱신: 2026-09-25 (Step 3 — 서비스 간 호출 5.6절(ADR-011), 1절 직접 호출 문장. 그 전: 2026-09-23 Step 1 회원/인증 엔드포인트, 인증 · 쿠키 · CORS · rate limit 규칙, `code` 필드)

## 1. 모든 외부 접근은 Gateway 경유

- 클라이언트(Web/Admin/Mobile)는 **API Gateway(:4000)** 만 호출한다. 마이크로서비스 포트(4001~4005)를 직접 호출하지 않는다.
- 클라이언트(와 사람)의 서비스 포트 직접 호출은 로컬 개발/디버깅 용도로만 허용한다. 이때는 5절의 내부 토큰(`x-internal-token`)을 직접 실어야 한다. 서비스 간 동기 호출은 [ADR-011](../adr/ADR-011-service-to-service-calls.md)(5.6절) 규칙으로만 한다.
- Gateway는 라우팅, Request ID 발급/전파, 공통 로깅, 공통 에러 정책에 더해 **access token 검증 · 내부 헤더 전달 · 내부 토큰 부착 · `Origin` 허용 목록 확인 · IP 단위 rate limit · CORS**를 담당한다(5절, [ADR-009](../adr/ADR-009-authentication.md)). 비즈니스 로직과 경로별 인증 정책 · 역할 판단은 두지 않는다.

## 2. 버저닝

- 모든 비즈니스 API는 `/api/v1` prefix를 사용한다.
  - 예: `GET /api/v1/members/{id}`
- Breaking change가 필요할 때만 `/api/v2`를 추가하고, v1은 폐기 일정 공지 후 제거한다.
- `/health`, `/docs`는 버저닝 대상이 아니다(운영/문서용 엔드포인트).

## 3. Gateway 라우팅 테이블

원천은 `apps/api-gateway/src/proxy/routes.ts`(`createProxyRoutes`). prefix 매칭은 `pathname === prefix || pathname.startsWith(prefix + '/')`이며 `POST /api/v1/members`(끝 슬래시 없음)도 잡는다. "인증" 열은 요약이고 **원천은 각 서비스의 `@Public()` · `@Roles()` 데코레이터**다 — Gateway는 경로별 인증 정책을 갖지 않는다(5.1절).

| 경로 prefix            | 대상 서비스      | 포트 | 인증 (원천은 서비스, 9.3절 인덱스)                                                        |
| ---------------------- | ---------------- | ---- | ----------------------------------------------------------------------------------------- |
| `/api/v1/members`      | member-service   | 4001 | `POST /members` 공개 · `/members/me` 회원 · 목록 · 상세 · 상태 변경 ADMIN                 |
| `/api/v1/auth`         | member-service   | 4001 | `login` · `refresh` · `logout` 공개 · `password` · `logout-all` 회원                      |
| `/api/v1/events`       | event-service    | 4002 | 공개 — 목록 · 상세(읽기 전용)                                                             |
| `/api/v1/meetups`      | event-service    | 4002 | ADMIN — 상품 · 회차 관리 전부                                                             |
| `/api/v1/applications` | event-service    | 4002 | 회원(MEMBER 전용) — 신청 · 내 신청 · 본인 취소. 운영자 신청 관리는 `/api/v1/meetups` 아래 |
| `/api/v1/matches`      | matching-service | 4003 | 결정 예정 (Step 6)                                                                        |
| `/api/v1/preferences`  | matching-service | 4003 | 결정 예정 (Step 6)                                                                        |
| `/api/v1/payments`     | payment-service  | 4005 | 결정 예정 (Step 4)                                                                        |

- notification-service(4004)는 외부 라우팅 대상이 아니다. Kafka 이벤트를 소비해 동작하는 내부 서비스다(현재는 구조만 준비).
- 라우팅 대상 URL은 각 환경 변수(`MEMBER_SERVICE_URL` 등)로 주입한다. `.env.example` 참고.
- Gateway가 인증 요구를 판단하지 않으므로 새 공개 엔드포인트(예: Step 2 공개 일정 조회 `/api/v1/events`)가 생겨도 Gateway 변경이 필요 없다. 새 prefix가 생길 때만 이 표와 `routes.ts`를 함께 고친다(예: Step 2 운영자 경로 `/api/v1/meetups` — [SPEC-002 7절](../specs/SPEC-002-meetup-schedule.md#7-api-변경)).

## 4. 공통 응답 계약

### 4.1 성공 응답

- 성공 응답은 래핑하지 않고 리소스 객체를 그대로 준다(예: `MemberProfile`).
- 목록은 `{ items, total, page, pageSize }` 형태다(예: `GET /api/v1/members`).
- 본문이 없는 성공은 `204`다(로그아웃 · 비밀번호 변경 · 탈퇴).

### 4.2 에러 응답

모든 서비스와 Gateway는 에러 시 `@oneul-sai/contracts`의 `ApiErrorResponse` 형태로 응답한다.

```ts
interface ApiErrorResponse {
  statusCode: number; // HTTP 상태 코드
  error: string; // 에러 분류 (예: 'Not Found', 'Bad Request')
  message: string; // 사람이 읽을 수 있는 설명. 입력값을 되돌려 주지 않는다
  code?: string; // 기계용 코드 (선택). 클라이언트는 이 값으로만 분기한다
  path: string; // 요청 경로 — query string을 뗀 pathname
  requestId?: string; // x-request-id 값 (있으면 반드시 포함)
  timestamp: string; // ISO 8601
}
```

예시:

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "access token이 만료되었습니다.",
  "code": "TOKEN_EXPIRED",
  "path": "/api/v1/members/me",
  "requestId": "3f2b6c1e-8f0a-4c7d-9b2e-5a1d0c9e7f42",
  "timestamp": "2026-09-23T01:23:45.678Z"
}
```

- `code`는 SPEC-001에서 추가한 선택 필드다(하위 호환). 401의 원인(만료 / 무효)이나 400의 원인(검증 / 연령 / 동의)을 `message`만으로는 가를 수 없기 때문이다. **코드 값 목록은 각 설계서의 "에러 코드 표"와 Swagger**가 원천이며, 현재 정의된 전체는 `packages/contracts`의 `API_ERROR_CODES`다. 클라이언트는 `message`가 아니라 `code`로 분기하고 문구는 자기 쪽에서 고른다.
- `path`는 `new URL(originalUrl, 'http://x').pathname`이다. 운영자 검색어(`?query=010...`) 같은 query string이 응답 · 로그에 남지 않게 한다. Gateway 요청 로거도 같다.
- 요청 검증은 `packages/contracts`의 Zod 스키마(모두 `strict` — 모르는 필드 → 400)를 서비스의 `ZodValidationPipe`가 실행한다. 실패는 400 `VALIDATION_FAILED`이고 `message`는 `issue.path`와 `issue.code`만으로 만든 고정 문구(예: `phone: 형식`)다.
- 본문을 받는 경로는 `Content-Type: application/json`만 받는다(아니면 400 `VALIDATION_FAILED`, `message`: `content-type: application/json`). 이유는 로그인 CSRF 차단 — SPEC-001 7절 공통 규칙.

## 5. 인증 · 쿠키 · CORS · rate limit (Step 1)

원천은 [SPEC-001 회원/인증](../specs/SPEC-001-member-auth.md) 7 · 12절과 [ADR-009 인증 방식](../adr/ADR-009-authentication.md)이며, 구현 상세는 [apps/api-gateway/README.md](../../apps/api-gateway/README.md)와 [apps/member-service/README.md](../../apps/member-service/README.md)다. 여기서는 모든 API가 따르는 규칙만 적는다.

**청중별 경로.** 비공개 필드가 있는 리소스는 청중별 경로와 스키마로 나누고, 공개 핸들러는 역할에 따라 응답을 바꾸지 않는다(SPEC-002 D9). 예: 회차는 참가자 공개 경로 `/api/v1/events`(`@Public()`, `PublicSchedule` — 지역만)와 운영자 경로 `/api/v1/meetups/:meetupId/schedules/**`(클래스 수준 `@Roles('ADMIN')`, `AdminSchedule` — 정확한 장소 · 취소 사유 포함)로 나뉜다. 운영자도 공개 경로에서는 비공개 필드를 받지 않는다. 운영자 경로 응답에는 `Cache-Control: no-store`를 붙인다.

### 5.1 Gateway 검증과 내부 헤더

1. Gateway는 **모든 요청**에서 클라이언트가 보낸 `x-user-` 접두사 헤더와 `x-internal-token`을 먼저 지운다(공개 · 보호 구분 없이).
2. `Authorization: Bearer <access token>`이 **있으면** 검증한다(HS256, `iss` · `aud` · `typ: at+jwt` · `exp`, `clockTolerance` 30초). 실패 → 401 `UNAUTHENTICATED`, 만료 → 401 `TOKEN_EXPIRED`. 성공 → `x-user-id`(UUID) · `x-user-role`(`MEMBER` | `ADMIN`)을 채우고 `Authorization`은 지운다.
3. `Authorization`이 **없으면** 헤더를 채우지 않고 그대로 프록시한다. 보호 경로면 서비스가 401 `UNAUTHENTICATED`를 낸다. 역할이 맞지 않으면 서비스가 403 `FORBIDDEN`을 낸다.
4. 프록시하는 모든 요청에 `x-internal-token`(env `INTERNAL_API_TOKEN`, Gateway와 서비스가 같은 값)을 붙인다. 서비스는 `/health`(정확히 일치)를 뺀 모든 핸들러에서 경로 대소문자와 무관하게 이 값을 가장 먼저 확인하고(없거나 다르면 401 `INTERNAL_TOKEN_INVALID` — `@Public()` 포함), `Authorization` 헤더는 보지 않는다. `/health`는 K8s 프로브가 직접 부르므로 검사하지 않는다. Swagger(`/docs` · `/docs-json`)는 Nest 가드를 거치지 않는 경로라 토큰 없이 열린다(API 문서만 보이고 핸들러에는 닿지 않는다). 허용 목록은 `@oneul-sai/service-kit`의 `INTERNAL_AUTH_EXEMPT_PATHS`다(SPEC-002 D10 · 12절, [ADR-010](../adr/ADR-010-platform-packages.md)).
5. 헤더 이름 · JWT 고정값 · 에러 코드는 `@oneul-sai/contracts`(`HEADER_USER_ID`, `HEADER_USER_ROLE`, `INTERNAL_HEADER_PREFIX`, `HEADER_INTERNAL_TOKEN`, `JWT_*`, `API_ERROR_CODES`)에서 가져온다.

로그인 · 로그아웃 · 정지 · 탈퇴는 남은 access token(최대 15분)에 즉시 반영되지 않는다(거부 목록 없음). **member-service**의 회원 · ADMIN 경로는 호출자의 상태를 다시 읽어 `WITHDRAWN` → 401 `UNAUTHENTICATED`, `SUSPENDED` → 403 `ACCOUNT_SUSPENDED`를 낸다. event-service 등 다른 서비스의 ADMIN 경로는 계정 상태를 모른다 — 정지 · 탈퇴된 운영자의 남은 access token(최대 15분)이 통한다(SPEC-002 12절, 즉시 차단은 결정 예정 (Step 8)). event-service의 신청(`POST /api/v1/applications`)은 member-service 위임 호출로 계정 상태를 확인한다 — 정지 403 · 탈퇴 401(SPEC-003 D5, 5.6절). 그 밖의 event-service 경로(운영자 경로 포함)는 여전히 모른다(결정 예정 (Step 8)).

### 5.2 refresh 쿠키와 본문 `client` 필드

- access token(JWT, 15분)은 응답 본문 `accessToken`으로 주고 클라이언트는 메모리에만 둔다. refresh token(불투명, 30일)은 **`Set-Cookie`로만** 준다 — 본문에 없다.
- 쿠키는 앱별로 이름이 다르다: 참가자 웹 `onulsai_rt_web`(`SameSite=Lax`), 운영자 웹 `onulsai_rt_admin`(`SameSite=Strict`). 둘 다 `HttpOnly; Secure(COOKIE_SECURE); Path=/api/v1/auth; Max-Age=<REFRESH_TTL>`, Domain 속성 없음(Gateway 호스트 전용). `Path` 때문에 `/api/v1/auth/*` 요청에만 실리고 `/api/v1/members/*`에는 실리지 않는다.
- 두 쿠키는 호스트 · `Path`가 같아 브라우저가 어느 앱의 `/api/v1/auth/*` 요청에든 **둘 다** 보낸다. 그래서 **`POST /api/v1/auth/login` · `refresh` · `logout`은 본문에 `client: 'WEB' | 'ADMIN'`을 싣고, 서비스는 `client`가 가리키는 이름의 쿠키만 읽는다**(`WEB` → `onulsai_rt_web`, `ADMIN` → `onulsai_rt_admin`). 한 브라우저에 web과 admin이 함께 로그인돼 두 쿠키가 공존하는 것은 정상이며 에러가 아니다. 그 쿠키가 없으면 400 `VALIDATION_FAILED`, 토큰 행의 발급 앱이 `client`와 다르면 401 `INVALID_REFRESH_TOKEN`.
- `client: 'ADMIN'`인 login · refresh · logout은 `Origin` 헤더가 member-service의 `ADMIN_ORIGIN`과 같아야 한다. 아니면 login · refresh는 403 `ORIGIN_NOT_ALLOWED`, logout은 폐기 없이 204 + 쿠키 삭제(멱등). MEMBER가 `client: 'ADMIN'`으로 로그인하면 403 `ROLE_NOT_ALLOWED`.
- refresh는 회전한다(요청마다 새 토큰, 옛 토큰은 `ROTATED`). 회전 직후 60초 안의 옛 토큰은 다중 탭 경합으로 보고 access token만 준다(`Set-Cookie` 없음, 같은 가족에 `ACTIVE`가 남아 있을 때만). 60초 밖의 옛 토큰은 재사용으로 보고 가족(세션) 전체를 폐기한다 → 401 `REFRESH_TOKEN_REUSED`.
- 쿠키 삭제: 로그아웃은 `client`의 쿠키를, 모든 기기 로그아웃은 요청에 실린 이 회원의 쿠키를, 탈퇴는 두 이름 모두 `Max-Age=0; Path=/api/v1/auth`로 지운다.
- 클라이언트(`@oneul-sai/api-client`)는 `credentials: 'include'`로 호출하고, 401 + `code: 'TOKEN_EXPIRED'`일 때만 refresh(본문 `{ client }`) 뒤 한 번 재시도한다(같은 탭 안에서는 single-flight). `POST /auth/login` · `refresh` · `logout`과 `POST /members`에는 `Authorization`을 붙이지 않는다.

### 5.3 CORS와 `Origin` 확인

- Gateway는 `CORS_ORIGINS`(쉼표 구분, 기본 `http://localhost:3000,http://localhost:3001`) 목록만 허용하고 `credentials: true`, `exposedHeaders: ['x-request-id']`로 응답한다. `*`는 env 검증에서 거부한다. 프로덕션은 localhost 밖의 `http://` origin을 거부한다.
- `Origin` 헤더가 있는 `POST /api/v1/auth/*`는 그 값이 `CORS_ORIGINS`에 있을 때만 통과한다(아니면 403 `ORIGIN_NOT_ALLOWED`, 서비스 미도달). `Origin`이 없는 비브라우저 호출은 그대로 둔다. CORS는 응답 열람만 막고 요청 자체는 막지 않으므로 다른 사이트의 form 제출이 로그인 · 로그아웃에 닿지 못하게 하는 장치다(4.2절의 JSON content-type 요구와 한 쌍).
- 운영 체크리스트: member-service `ADMIN_ORIGIN`은 Gateway `CORS_ORIGINS`에도 있어야 한다. 웹과 Gateway는 같은 사이트(eTLD+1)여야 쿠키가 동작한다 — 프로덕션 도메인은 결정 예정 (Step 8).

### 5.4 IP 단위 rate limit

- 대상 여섯 경로(method + pathname 정확 일치): `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/members`, `POST /api/v1/auth/password`, `PATCH /api/v1/members/me`, `DELETE /api/v1/members/me`. 뒤의 세 경로는 Bearer가 있어도 대상이다(탈취한 access token으로 비밀번호 확인 오라클을 돌리지 못하게).
- IP당 토큰 버킷 하나, 용량 · 분당 충전량 = `RATE_LIMIT_AUTH_PER_MINUTE`(기본 10). 초과 → 429 `TOO_MANY_REQUESTS` + `Retry-After`. 화면 문구는 어디서든 같다: "요청이 많아 잠시 후 다시 시도해 주세요."
- 인메모리 · 단일 인스턴스다. 분산(Redis) 제한과 로드밸런서 뒤의 클라이언트 IP(`trust proxy`)는 결정 예정 (Step 8).
- 계정 단위 제한은 Gateway가 아니라 member-service의 로그인 백오프가 맡는다(15분 안 4회 실패 뒤 5번째 시도부터 검증 전 지연, 계정 단위 직렬화, 잠금 없음 — SPEC-001 12절). 지연을 알리는 별도 코드 · 헤더는 없다.

### 5.5 공개 조회와 서버 컴포넌트

- `@Public()` 조회는 Next 서버 컴포넌트에서 **토큰 없이** 불러도 된다. 예: 참가자 웹 `/events` · `/events/[id]`가 `GET /api/v1/events` · `GET /api/v1/events/:id`를 서버에서 부른다(SPEC-002 D11). 토큰 없이 부르는 공개 조회는 BFF가 아니다.
- 보호 데이터(토큰이 필요한 경로)는 여전히 클라이언트 컴포넌트에서만 조회한다. 서버 컴포넌트 · Route Handler는 보호 경로를 부르지 않는다([ADR-009](../adr/ADR-009-authentication.md) 결정 5).
- 서버용 클라이언트는 `server-only` 모듈 안에 두고 인스턴스를 내보내지 않는다. 그 모듈은 공개 조회 함수만 내보내고 항상 `auth: false`로 부른다 — 서버 프로세스의 토큰 저장소가 방문자 사이에 섞일 경로를 없앤다(참가자 웹 `apps/web/lib/public-api.ts`).
- 서버 쪽 캐시는 요청 헤더가 키에 들어가지 않는 **데이터 단위 캐시**로 한다(키 = 함수 · `page` 또는 `id`). `fetch`의 `next.revalidate`로 캐시하면 api-client가 호출마다 붙이는 무작위 `x-request-id`가 키에 들어가 적중하지 않는다. 키가 되는 값은 캐시 앞에서 좁힌다(`page`는 [1, `PAGE_MAX`] 정수, `id`가 UUID가 아니면 부르지 않는다).

### 5.6 서비스 간 호출 ([ADR-011](../adr/ADR-011-service-to-service-calls.md))

- 사용자 요청을 처리하는 **동기 경로**에서, **호출자 본인의 데이터**를, 소유 서비스의 `/api/v1` **읽기(GET) API**로 읽을 때만 서비스가 다른 서비스를 직접 부른다(위임 호출). Gateway를 거치지 않고 서비스 포트로 부른다.
- 받은 `x-user-id` · `x-user-role` · `x-request-id`를 **바꾸지 않고** 싣고 자기 `x-internal-token`을 붙인다. 헤더를 새로 만들거나 역할을 올리지 않는다. 변경 경로는 부르지 않는다.
- 허용 목록(경로는 코드에 고정, 주소는 env):

  | 호출하는 서비스 | 대상 · 경로                             | env                  | 쓰는 필드                                  |
  | --------------- | --------------------------------------- | -------------------- | ------------------------------------------ |
  | event-service   | member-service `GET /api/v1/members/me` | `MEMBER_SERVICE_URL` | `status` · `role` · `gender` · `birthYear` |

- 응답은 (HTTP 상태, `code`) 쌍으로 해석한다. 호출자 본인의 상태(탈퇴 401 `UNAUTHENTICATED`, 정지 403 `ACCOUNT_SUSPENDED`)만 그대로 전하고, 예상 밖(401 `INTERNAL_TOKEN_INVALID` · 403 `FORBIDDEN` · 그 밖 4xx · 형식 오류)은 503 `SERVICE_BUSY` + error 로그, 5xx · 네트워크 · 시간 초과는 503 + warn 로그다(SPEC-003 7절 표). 쓰는 필드만 남긴다(`pick`).
- 호출은 DB 트랜잭션 밖에서, 제한 시간(3초)을 두고 한 번만 한다. 로그에는 상태 · `code` · 에러 이름 · 걸린 시간 · `requestId`만 남긴다.
- 호출자 문맥이 없는 서비스 간 조회(결제 이벤트 소비자, 알림 받는 사람 정보)는 결정 예정 (Step 4 · 7).

## 6. Request ID

- 헤더 이름: `x-request-id`
- 클라이언트가 보내지 않으면 Gateway가 생성한다. Gateway는 다운스트림 호출 시 같은 헤더를 그대로 전달하고, 응답에도 포함한다.
- 각 서비스는 로그와 에러 응답(`requestId` 필드)에 이 값을 남긴다.
- 전파 전략의 상세는 [아키텍처 개요](../architecture/overview.md)를 참고한다.

## 7. Swagger (API 문서)

- 각 백엔드 서비스는 자체 Swagger UI를 노출한다: `http://localhost:<port>/docs`
  - 예: member-service → `http://localhost:4001/docs`
- 서비스 포트를 직접 부를 때("Try it out" 포함)는 `.env`의 `INTERNAL_API_TOKEN`을 `x-internal-token` 헤더에 싣고, 보호 경로는 `x-user-id`(UUID) · `x-user-role`도 직접 채운다(5.1절).
- Gateway 차원의 통합 문서는 이후 단계에서 검토한다.

## 8. Health 규약

- 모든 백엔드 서비스(Gateway 포함)는 `GET /health`를 노출한다.
- 규약: 정상일 때 HTTP `200`, JSON body에 `status: "ok"`와 서비스 식별 정보를 포함한다.
- `/health`는 인증 · 내부 토큰 · rate limit 대상이 아니며, Kubernetes Liveness/Readiness Probe와 로컬 wiring 확인에 사용한다.
- Gateway의 `/health`는 Gateway 자신의 상태만 응답한다(다운스트림 상태 집계는 이후 단계에서 결정).

## 9. API 문서 운영 방식

### 9.1 원천은 Swagger다

- 각 서비스의 API 문서 원천은 코드다. `main.ts`의 `DocumentBuilder`가 서비스 제목·설명·버전을, 컨트롤러의 데코레이터(`@ApiTags`, `@ApiOperation`, `@ApiOkResponse` 등)가 엔드포인트 명세를 만든다.
- 서비스를 띄우면 `http://localhost:<port>/docs`에서 항상 최신 문서를 본다.
- 이 문서(`docs/api/README.md`)는 **규약과 인덱스**만 담는다. 요청/응답 필드를 여기에 다시 적지 않는다. Swagger와 이 문서가 다르면 Swagger가 맞다.

### 9.2 새 엔드포인트를 추가하는 절차

| 순서 | 할 일                                                                                                                                      | 어디에                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 1    | 설계서의 "API 변경" 절에 메서드·경로·요청·응답·에러(`code`)·인증 요구를 적는다                                                             | `docs/specs/SPEC-00N-*.md`                                          |
| 2    | 컨트롤러를 만들고 Swagger 데코레이터를 단다. `@ApiOperation({ summary })`는 필수. 공개 경로면 `@Public()`, 운영자 경로면 `@Roles('ADMIN')` | `apps/<service>/src/**/*.controller.ts`                             |
| 3    | 요청/응답 스키마를 Zod(`strict`)로 정의하고 타입을 내보낸다. 새 에러 코드는 `API_ERROR_CODES`에 더한다                                     | `packages/contracts`                                                |
| 4    | 클라이언트 함수를 추가한다. 공개 경로면 `Authorization`을 붙이지 않는 목록에 넣는다                                                        | `packages/api-client`                                               |
| 5    | 아래 9.3 엔드포인트 인덱스 표에 한 줄을 추가한다(인증 열 포함)                                                                             | 이 문서                                                             |
| 6    | Gateway 라우팅이 필요한 새 prefix면 3절 라우팅 테이블과 `apps/api-gateway/src/proxy/routes.ts`를 함께 고친다                               | 이 문서, Gateway                                                    |
| 7    | 비밀번호 확인이 일어나거나 인증 없이 비싼 연산을 태우는 경로면 Gateway rate limit 대상 목록(5.4절)에 더한다                                | `apps/api-gateway/src/middleware/rate-limit.middleware.ts`, 이 문서 |

변경·삭제도 같은 순서다. 삭제한 엔드포인트는 표에서 지우지 말고 상태를 "폐기"로 바꾸고 폐기 일자를 적는다. 다음 메이저 버전에서 표에서 제거한다.

### 9.3 엔드포인트 인덱스

"인증" 열: **공개** = 토큰 없이 호출(`@Public()`), **회원** = 유효한 access token(MEMBER · ADMIN 모두, 본인 계정), **ADMIN** = `x-user-role: ADMIN`(`@Roles('ADMIN')`). Swagger 링크는 서비스를 띄운 뒤 열린다. 요청 · 응답 · 에러 코드의 상세는 Swagger와 [SPEC-001 7절](../specs/SPEC-001-member-auth.md#7-api-변경) · [SPEC-002 7절](../specs/SPEC-002-meetup-schedule.md#7-api-변경).

| 서비스         | 메서드 | 경로                                                                                 | 인증  | 설명                                                                                                                                                                                                                                                                                                                                                                                           | Swagger                                                                                   | 상태 |
| -------------- | ------ | ------------------------------------------------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---- |
| member-service | POST   | `/api/v1/members`                                                                    | 공개  | 가입. 201 `MemberProfile`. 같은 이메일 409 `EMAIL_ALREADY_EXISTS`                                                                                                                                                                                                                                                                                                                              | [열기](http://localhost:4001/docs#/members/MembersController_signup)                      | 확정 |
| member-service | POST   | `/api/v1/auth/login`                                                                 | 공개  | 로그인. `{ email, password, client }` → 200 `AuthResponse` + 쿠키                                                                                                                                                                                                                                                                                                                              | [열기](http://localhost:4001/docs#/auth/AuthController_login)                             | 확정 |
| member-service | POST   | `/api/v1/auth/refresh`                                                               | 공개  | refresh 회전. `{ client }` + 쿠키 → 200 `AuthResponse` (+ 쿠키)                                                                                                                                                                                                                                                                                                                                | [열기](http://localhost:4001/docs#/auth/AuthController_refresh)                           | 확정 |
| member-service | POST   | `/api/v1/auth/logout`                                                                | 공개  | 로그아웃. `{ client }` + 쿠키 → 204 + 쿠키 삭제. 완전 멱등                                                                                                                                                                                                                                                                                                                                     | [열기](http://localhost:4001/docs#/auth/AuthController_logout)                            | 확정 |
| member-service | POST   | `/api/v1/auth/logout-all`                                                            | 회원  | 모든 기기에서 로그아웃 → 204 + 쿠키 삭제                                                                                                                                                                                                                                                                                                                                                       | [열기](http://localhost:4001/docs#/auth/AuthController_logoutAll)                         | 확정 |
| member-service | POST   | `/api/v1/auth/password`                                                              | 회원  | 비밀번호 변경. `{ currentPassword, newPassword }` → 204                                                                                                                                                                                                                                                                                                                                        | [열기](http://localhost:4001/docs#/auth/AuthController_changePassword)                    | 확정 |
| member-service | GET    | `/api/v1/members/me`                                                                 | 회원  | 내 프로필 → 200 `MemberProfile`                                                                                                                                                                                                                                                                                                                                                                | [열기](http://localhost:4001/docs#/members/MembersController_me)                          | 확정 |
| member-service | PATCH  | `/api/v1/members/me`                                                                 | 회원  | 휴대폰(현재 비밀번호 필수) · 마케팅 수신 동의 수정 → 200                                                                                                                                                                                                                                                                                                                                       | [열기](http://localhost:4001/docs#/members/MembersController_updateMe)                    | 확정 |
| member-service | DELETE | `/api/v1/members/me`                                                                 | 회원  | 탈퇴. `{ password }` → 204 + 두 쿠키 삭제. 즉시 익명화                                                                                                                                                                                                                                                                                                                                         | [열기](http://localhost:4001/docs#/members/MembersController_withdraw)                    | 확정 |
| member-service | GET    | `/api/v1/members`                                                                    | ADMIN | 회원 목록. `MemberListQuery` → `{ items, total, page, pageSize }`. `ids`(쉼표로 이은 회원 ID, `pageSize` 이하 · 최대 100개)는 다른 필터와 AND — 운영자 신청 목록이 신청자 정보를 합칠 때 쓴다(SPEC-003 D11). `ids` 조회의 접속기록에는 돌려준 회원 ID(`memberIds`)가 남는다                                                                                                                    | [열기](http://localhost:4001/docs#/members/MembersController_list)                        | 확정 |
| member-service | GET    | `/api/v1/members/:id`                                                                | ADMIN | 회원 상세 → 200 `MemberDetail`. 없으면 404 `MEMBER_NOT_FOUND`                                                                                                                                                                                                                                                                                                                                  | [열기](http://localhost:4001/docs#/members/MembersController_detail)                      | 확정 |
| member-service | PATCH  | `/api/v1/members/:id/status`                                                         | ADMIN | 계정 상태 변경(ACTIVE ↔ SUSPENDED). `{ status, reason? }` → 200                                                                                                                                                                                                                                                                                                                                | [열기](http://localhost:4001/docs#/members/MembersController_updateStatus)                | 확정 |
| event-service  | GET    | `/api/v1/events`                                                                     | 공개  | 공개 일정 목록(각 항목에 성별 자리 마감 `maleFull` · `femaleFull`, SPEC-003). OPEN · CLOSED이고 시작 전 → `PublicScheduleListResponse`(`pageSize` ≤ 50)                                                                                                                                                                                                                                        | [열기](http://localhost:4002/docs#/events/PublicEventsController_list)                    | 확정 |
| event-service  | GET    | `/api/v1/events/:id`                                                                 | 공개  | 공개 일정 상세 → `PublicSchedule`(+ `maleFull` · `femaleFull`). DRAFT · CANCELLED · 없음은 같은 404 `SCHEDULE_NOT_FOUND`                                                                                                                                                                                                                                                                       | [열기](http://localhost:4002/docs#/events/PublicEventsController_detail)                  | 확정 |
| event-service  | GET    | `/api/v1/meetups`                                                                    | ADMIN | 모임 상품 목록 → `MeetupListResponse`                                                                                                                                                                                                                                                                                                                                                          | [열기](http://localhost:4002/docs#/meetups/MeetupsController_list)                        | 확정 |
| event-service  | POST   | `/api/v1/meetups`                                                                    | ADMIN | 모임 상품 등록. `{ title, description? }` → 201 `Meetup`                                                                                                                                                                                                                                                                                                                                       | [열기](http://localhost:4002/docs#/meetups/MeetupsController_create)                      | 확정 |
| event-service  | GET    | `/api/v1/meetups/:meetupId`                                                          | ADMIN | 모임 상품 상세 → `Meetup`. 없으면 404 `MEETUP_NOT_FOUND`                                                                                                                                                                                                                                                                                                                                       | [열기](http://localhost:4002/docs#/meetups/MeetupsController_get)                         | 확정 |
| event-service  | PATCH  | `/api/v1/meetups/:meetupId`                                                          | ADMIN | 모임 상품 수정 → `Meetup`(모든 회차 응답에 반영)                                                                                                                                                                                                                                                                                                                                               | [열기](http://localhost:4002/docs#/meetups/MeetupsController_update)                      | 확정 |
| event-service  | GET    | `/api/v1/meetups/:meetupId/schedules`                                                | ADMIN | 회차 목록(모든 상태, `status?` · `from?` · `to?`) → `AdminScheduleListResponse`. 운영자 회차 응답은 모두 신청 수 `appliedMale` · `appliedFemale`과 `maleFull` · `femaleFull`을 싣는다(SPEC-003 D10)                                                                                                                                                                                            | [열기](http://localhost:4002/docs#/schedules/AdminSchedulesController_list)               | 확정 |
| event-service  | POST   | `/api/v1/meetups/:meetupId/schedules`                                                | ADMIN | 회차 생성 → 201 `AdminSchedule`(DRAFT). 시간 규칙 400 `SCHEDULE_TIME_INVALID`                                                                                                                                                                                                                                                                                                                  | [열기](http://localhost:4002/docs#/schedules/AdminSchedulesController_create)             | 확정 |
| event-service  | POST   | `/api/v1/meetups/:meetupId/schedules/batch`                                          | ADMIN | 여러 회차 등록(1~12개, 전부 DRAFT, 전부 또는 없음) → 201 `{ items }`. 트랜잭션 연결 대기 초과 503 `SERVICE_BUSY`(아무것도 만들어지지 않음)                                                                                                                                                                                                                                                     | [열기](http://localhost:4002/docs#/schedules/AdminSchedulesController_createBatch)        | 확정 |
| event-service  | GET    | `/api/v1/meetups/:meetupId/schedules/:scheduleId`                                    | ADMIN | 회차 상세(장소 안내 포함) → `AdminSchedule`                                                                                                                                                                                                                                                                                                                                                    | [열기](http://localhost:4002/docs#/schedules/AdminSchedulesController_get)                | 확정 |
| event-service  | PATCH  | `/api/v1/meetups/:meetupId/schedules/:scheduleId`                                    | ADMIN | 회차 수정(보낸 필드만, 병합 판정). CANCELLED 409 `SCHEDULE_NOT_EDITABLE`. 정원 < 그 성별 활성 신청 수 409 `CAPACITY_BELOW_APPLICATIONS`. 잠금 대기 2초 초과 503 `SERVICE_BUSY`(SPEC-003 D3 · D8)                                                                                                                                                                                               | [열기](http://localhost:4002/docs#/schedules/AdminSchedulesController_update)             | 확정 |
| event-service  | PATCH  | `/api/v1/meetups/:meetupId/schedules/:scheduleId/status`                             | ADMIN | 상태 변경 `{ status, cancelReason? }`(SPEC-002 6절 전이 표) → `AdminSchedule`. → CANCELLED면 같은 트랜잭션에서 그 회차의 활성 신청을 모두 취소(`cancelledBy: SCHEDULE`). 잠금 대기 2초 초과 503                                                                                                                                                                                                | [열기](http://localhost:4002/docs#/schedules/AdminSchedulesController_updateStatus)       | 확정 |
| event-service  | DELETE | `/api/v1/meetups/:meetupId/schedules/:scheduleId`                                    | ADMIN | 회차 삭제(DRAFT만) → 204. 그 밖 409 `SCHEDULE_NOT_EDITABLE`. 잠금 대기 2초 초과 503                                                                                                                                                                                                                                                                                                            | [열기](http://localhost:4002/docs#/schedules/AdminSchedulesController_remove)             | 확정 |
| event-service  | POST   | `/api/v1/applications`                                                               | 회원  | 참가 신청 `{ scheduleId }` → 201 `MyApplication`(입금 대기, 성별 참가비 스냅샷). member-service 위임 호출(정지 403 · 탈퇴 401 · 실패 503) 뒤 회차 행 잠금 판정: 404 `SCHEDULE_NOT_FOUND`, 409 `APPLICATION_CLOSED` · `ALREADY_APPLIED` · `REAPPLY_NOT_ALLOWED` · `PENDING_APPLICATION_LIMIT` · `BIRTH_YEAR_OUT_OF_RANGE` · `SCHEDULE_FULL`(이 순서의 첫 코드), 503 `SERVICE_BUSY`. ADMIN은 403 | [열기](http://localhost:4002/docs#/applications/ApplicationsController_apply)             | 확정 |
| event-service  | GET    | `/api/v1/applications`                                                               | 회원  | 내 신청(모든 상태, 최근부터, `scheduleId?`, `pageSize` ≤ 50) → `MyApplicationListResponse`. 회차는 공개 필드만                                                                                                                                                                                                                                                                                 | [열기](http://localhost:4002/docs#/applications/ApplicationsController_listMine)          | 확정 |
| event-service  | PATCH  | `/api/v1/applications/:applicationId/status`                                         | 회원  | 본인 취소 `{ status: 'CANCELLED' }` — 신청 마감 전까지(회차가 CLOSED여도) → `MyApplication`. 마감 뒤 409 `APPLICATION_NOT_CANCELLABLE`, 남의 신청 · 없음은 같은 404 `APPLICATION_NOT_FOUND`, 같은 상태는 no-op 200                                                                                                                                                                             | [열기](http://localhost:4002/docs#/applications/ApplicationsController_cancelMine)        | 확정 |
| event-service  | GET    | `/api/v1/meetups/:meetupId/schedules/:scheduleId/applications`                       | ADMIN | 회차의 신청 목록(신청 순, `status?`, `pageSize` ≤ 100) → `AdminApplicationListResponse`. 이름 · 휴대폰은 없다 — `GET /api/v1/members?ids=`로 합친다(D11). 접속기록 `application.list_viewed`                                                                                                                                                                                                   | [열기](http://localhost:4002/docs#/admin-applications/AdminApplicationsController_list)   | 확정 |
| event-service  | PATCH  | `/api/v1/meetups/:meetupId/schedules/:scheduleId/applications/:applicationId/status` | ADMIN | 운영자 취소(언제든, 사유 없음) → `AdminApplication`. 다른 상품의 회차 404 `SCHEDULE_NOT_FOUND`, 그 회차의 신청이 아니면 404 `APPLICATION_NOT_FOUND`                                                                                                                                                                                                                                            | [열기](http://localhost:4002/docs#/admin-applications/AdminApplicationsController_cancel) | 확정 |

운영 엔드포인트(버저닝 · 인증 · 내부 토큰 대상 아님):

| 서비스               | 포트 | 메서드 | 경로      | 설명                             | 상태 |
| -------------------- | ---- | ------ | --------- | -------------------------------- | ---- |
| api-gateway          | 4000 | GET    | `/health` | Gateway 프로세스 상태            | 확정 |
| api-gateway          | 4000 | GET    | `/docs`   | Swagger UI                       | 확정 |
| member-service       | 4001 | GET    | `/health` | 서비스 상태 (DB `SELECT 1` 포함) | 확정 |
| member-service       | 4001 | GET    | `/docs`   | Swagger UI                       | 확정 |
| event-service        | 4002 | GET    | `/health` | 서비스 상태                      | 확정 |
| event-service        | 4002 | GET    | `/docs`   | Swagger UI                       | 확정 |
| matching-service     | 4003 | GET    | `/health` | 서비스 상태                      | 확정 |
| matching-service     | 4003 | GET    | `/docs`   | Swagger UI                       | 확정 |
| notification-service | 4004 | GET    | `/health` | 서비스 상태 (외부 라우팅 없음)   | 확정 |
| notification-service | 4004 | GET    | `/docs`   | Swagger UI (외부 라우팅 없음)    | 확정 |
| payment-service      | 4005 | GET    | `/health` | 서비스 상태                      | 확정 |
| payment-service      | 4005 | GET    | `/docs`   | Swagger UI                       | 확정 |

비즈니스 엔드포인트는 각 Step에서 이 표에 추가한다. 예상 prefix는 3절 라우팅 테이블을 따른다(`/api/v1/events`, `/api/v1/meetups`, `/api/v1/applications`, `/api/v1/matches`, `/api/v1/preferences`, `/api/v1/payments`).

### 9.4 버전 정책

- 모든 비즈니스 API는 `/api/v1`로 시작한다. 2절 버저닝 규칙을 따른다.
- **하위 호환을 지키는 변경**은 v1 안에서 한다: 선택 필드 추가, 새 엔드포인트 추가, 새 enum 값 추가(클라이언트가 모르는 값을 무시하도록 만든 경우). 예: SPEC-005가 `RefreshRequest` · `LogoutRequest`에 `refreshToken?`을, `ClientType`에 앱용 값을 더하는 것.
- **하위 호환을 깨는 변경**은 `/api/v2`를 새로 연다: 필드 삭제·이름 변경·타입 변경, 필수 필드 추가, 에러 코드 의미 변경, 경로 변경.
- v2를 열면 v1은 폐기 일정을 공지하고, 모든 클라이언트(Web/Admin/Mobile)가 옮긴 뒤 제거한다. 모바일은 배포 주기가 느리므로 여유를 둔다.
- `/health`, `/docs`는 버전을 붙이지 않는다.
- 서비스별 Swagger의 `setVersion`은 서비스 릴리스 버전이다. API 경로 버전(v1/v2)과는 다른 개념이다.

### 9.5 문서 갱신 판단

어떤 코드 변경에 어떤 문서를 고쳐야 하는지는 [문서 갱신 규칙 2절](../guides/documentation-rules.md#2-변경-유형별-갱신-표)이 원천이다. 요약은 [문서 지도의 판단표](../README.md#5-pr에서-어떤-문서를-고치나--판단표)에 있다.
