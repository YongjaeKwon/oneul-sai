# @oneul-sai/api-gateway

외부 Client의 단일 진입점. 비즈니스 로직을 두지 않는다. 설계 원천은 [SPEC-001 회원/인증](../../docs/specs/SPEC-001-member-auth.md) 7 · 10 · 12절과 [ADR-009 인증 방식](../../docs/adr/ADR-009-authentication.md).

## 역할

- **단일 진입점**: 모든 외부 요청은 게이트웨이(포트 4000)를 통해서만 내부 서비스에 도달한다.
- **라우팅**: `/api/v1/**` 요청을 경로 prefix 기준으로 내부 서비스에 프록시한다.
- **Request ID**: `x-request-id` 헤더가 없으면 생성하고, 응답 헤더와 내부 서비스로의 요청에 항상 전파한다.
- **토큰 검증 · 내부 헤더**: `Authorization: Bearer`(access token, HS256)를 검증해 `x-user-id` · `x-user-role`로 바꿔 서비스에 넘긴다. 외부에서 온 `x-user-*` 헤더는 모든 요청에서 버린다.
- **내부 토큰 부착**: 프록시하는 모든 요청에 `x-internal-token`(`INTERNAL_API_TOKEN`)을 붙인다. 서비스는 이 값이 맞는 요청만 받는다.
- **Origin 확인**: `Origin` 헤더가 있는 `POST /api/v1/auth/*`는 `CORS_ORIGINS`에 있는 origin만 통과시킨다(403 `ORIGIN_NOT_ALLOWED`).
- **IP rate limit**: 인증 · 비밀번호 확인 경로에 IP 단위 인메모리 토큰 버킷(429 `TOO_MANY_REQUESTS`).
- **CORS**: `CORS_ORIGINS` 목록만 허용, `credentials: true`(refresh 쿠키), `x-request-id` 노출.
- **공통 로깅/에러 정책**: 요청 완료 로그(method, path, statusCode, durationMs, requestId)와 전역 예외 필터(`ApiErrorResponse` 계약). 로그 · 에러 응답의 경로는 query string을 뗀 pathname이며 헤더는 어떤 것도 남기지 않는다(`Cookie` · `Authorization` · `x-internal-token`이 지나간다).

Gateway가 하지 **않는** 것: 경로별 인증 정책 · 역할 판단. 어느 엔드포인트가 인증을 요구하는지는 서비스의 `@Public()` 데코레이터가 원천이다. Bearer가 없는 요청은 헤더 없이 그대로 프록시되고 보호 경로면 서비스가 401을 낸다 — 그래서 Step 2의 공개 일정 조회(`/api/v1/events`)는 Gateway 변경 없이 열렸고, 운영자 경로는 새 prefix `/api/v1/meetups` 한 줄만 라우팅 표에 더했다([SPEC-002 7절](../../docs/specs/SPEC-002-meetup-schedule.md#7-api-변경)).

헤더 이름(`x-user-id` · `x-user-role` · `x-user-` 접두사 · `x-internal-token`), JWT 고정값(`HS256` · `iss` · `aud` · `typ`) · 클레임 스키마, 에러 코드는 member-service와 같은 값을 봐야 하므로 `@oneul-sai/contracts`에서 가져온다. Gateway만 아는 값(`clockTolerance` 30초, 시크릿 디코드)은 `src/auth/jwt.ts`에 있다.

## 미들웨어 순서

```
request-id → 요청 로거 → CORS → Origin 확인 → rate limit → auth(Bearer 검증) → 프록시(/api/v1/**) → Nest 라우트(/health, /docs)
```

앱 조립은 `src/app.ts`의 `createGatewayApp(env)`이고 `main.ts`는 그것을 `listen`만 한다. `app.use` · `enableCors`를 부른 순서가 곧 Express 등록 순서다. CORS가 프록시보다 앞에 있어 OPTIONS preflight는 프록시로 가지 않는다. Nest의 body parser와 라우트는 `listen` 시점에 맨 뒤에 붙으므로 프록시는 파싱되지 않은 본문 스트림을 그대로 넘긴다. 이 순서는 `src/app.spec.ts`가 앱을 임시 포트에 띄우고 가짜 upstream으로 검증한다(공개 경로 통과, 위조 헤더 제거, 내부 토큰 부착, 401 · 403 · 429 · 404 응답, CORS · preflight, `Set-Cookie` 통과).

## 라우팅 테이블

`src/proxy/routes.ts`의 `createProxyRoutes(env)`. prefix 매칭은 함수 `pathFilter`(`pathname === prefix || pathname.startsWith(prefix + '/')`)다 — http-proxy-middleware v3는 일반 문자열과 글롭을 섞은 배열(`['/api/v1/members', '/api/v1/members/**']`)을 거부하고, 단일 문자열은 `indexOf === 0`이라 `/api/v1/membersX`까지 잡기 때문이다. `POST /api/v1/members`(끝 슬래시 없음)와 `/api/v1/meetups` · `/api/v1/meetups/<id>/schedules` · `/api/v1/meetups/<id>/schedules/batch`가 프록시되고 `/api/v1/meetupsX`는 프록시되지 않는 것을 `src/proxy/proxy-req.spec.ts`가 실제 http-proxy-middleware로, 경로별 대상 서비스는 `src/proxy/path-filter.spec.ts`가 확인한다.

| Path prefix            | 대상 서비스             | 인증 필요 (SPEC-001 · SPEC-002 기준 · 원천은 서비스의 `@Public()` · `@Roles()`)           |
| ---------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `/api/v1/members`      | member-service (4001)   | `POST /members` 공개 · `/members/me` 회원 · 목록 · 상세 · 상태 변경 ADMIN                 |
| `/api/v1/auth`         | member-service (4001)   | `login` · `refresh` · `logout` 공개 · `password` · `logout-all` 회원                      |
| `/api/v1/events`       | event-service (4002)    | 공개 — 목록 · 상세(읽기 전용)                                                             |
| `/api/v1/meetups`      | event-service (4002)    | ADMIN — 상품 · 회차 관리 전부                                                             |
| `/api/v1/applications` | event-service (4002)    | 회원(MEMBER 전용) — 신청 · 내 신청 · 본인 취소. 운영자 신청 관리는 `/api/v1/meetups` 아래 |
| `/api/v1/matches`      | matching-service (4003) | 결정 예정 (Step 6)                                                                        |
| `/api/v1/preferences`  | matching-service (4003) | 결정 예정 (Step 6)                                                                        |
| `/api/v1/payments`     | payment-service (4005)  | 결정 예정 (Step 4)                                                                        |

notification-service는 외부 API를 노출하지 않는다(이벤트 기반).

## 인증 미들웨어 (`src/middleware/auth.middleware.ts`)

모든 요청에 대해 순서대로:

1. 들어온 `x-user-` 접두사 헤더와 `x-internal-token`을 지운다(공개 · 보호 구분 없이).
2. `OPTIONS`는 그대로 통과(preflight).
3. `Authorization`이 없으면 헤더를 채우지 않고 통과. 보호 경로면 서비스가 401 `UNAUTHENTICATED`를 낸다.
4. `Authorization: Bearer <jwt>`가 있으면 `jose.jwtVerify`로 검증한다 — `algorithms: ['HS256']` 고정, `iss: 'oneul-sai'`, `aud: 'oneul-sai-api'`, 헤더 `typ: 'at+jwt'`, `clockTolerance: 30`초. 키는 `JWT_ACCESS_SECRET`을 base64 디코드한 바이트다(member-service도 같은 바이트로 서명해야 한다).
   - 만료 → 401 `TOKEN_EXPIRED`(클라이언트는 refresh 후 1회 재시도).
   - 서명 · `iss` · `aud` · `typ` 불일치, `alg` 허용 밖, 형식 오류, Bearer 형식 아님 → 401 `UNAUTHENTICATED`.
   - 클레임 형식은 contracts의 `AccessTokenClaimsSchema`로 확인한다(`sub`가 UUID, `role`이 `MemberRole`). 아니면 401 `UNAUTHENTICATED`. 형식 확인일 뿐이며 역할로 무엇을 허용할지는 서비스가 정한다.
   - 성공 → `x-user-id = sub`, `x-user-role = role`을 채우고 `Authorization`을 지운다(서비스 로그에 토큰이 새지 않게).

401 응답은 `ApiErrorResponse` + `code`이며 `path`는 query 없는 pathname, `requestId`는 `x-request-id`다. 로그: `gateway.auth.rejected` warn `{ code, path, requestId }`.

## Origin 확인 (`src/middleware/origin-check.middleware.ts`)

`Origin` 헤더가 있는 `POST /api/v1/auth/*`는 그 값이 `CORS_ORIGINS`에 있을 때만 통과한다. 아니면 403 `ORIGIN_NOT_ALLOWED`(`gateway.auth.rejected` warn — origin 값은 남기지 않는다). `Origin`이 없는 비브라우저 호출은 그대로 둔다. CORS는 응답 열람만 막고 요청 자체는 막지 않으므로, 다른 사이트의 form 제출이 로그인 · 로그아웃에 닿지 못하게 하는 Gateway 쪽 장치다. `client: 'ADMIN'` 요청을 `ADMIN_ORIGIN`과 대조하는 것은 서비스 쪽 장치다.

## Rate limit (`src/middleware/rate-limit.middleware.ts`)

- 대상(여섯 경로, method + pathname 정확 일치 — 끝 슬래시 · 대소문자 · 퍼센트 인코딩 변형은 같은 경로로 본다): `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/members`, `POST /api/v1/auth/password`, `PATCH /api/v1/members/me`, `DELETE /api/v1/members/me`. 뒤의 세 경로는 Bearer가 있어도 대상이다 — 탈취한 access token 하나로 비밀번호 확인 오라클을 IP 제한 없이 돌릴 수 없게 한다. rate limit이 auth보다 앞에 있으므로 토큰 유효성과 무관하게 센다.
- 방식: IP당 토큰 버킷 하나(여섯 경로가 나눠 쓴다). 용량 · 분당 충전량 = `RATE_LIMIT_AUTH_PER_MINUTE`(기본 10). 초과 → 429 `TOO_MANY_REQUESTS` + `Retry-After`(다음 토큰까지의 초). 로그 `gateway.rate_limited` warn `{ path, ip: '1.2.3.*', requestId }`.
- IP는 `req.ip`(소켓 주소). `trust proxy`를 켜지 않았으므로 로드밸런서 뒤에서는 모두 같은 IP로 보인다 — 결정 예정 (Step 8).
- **단일 인스턴스 · 인메모리**다. 인스턴스가 늘면 인스턴스마다 따로 세어져 제한이 N배 느슨해진다. 분산(Redis) 제한은 결정 예정 (Step 8). 추적 IP가 10,000개를 넘으면 1분 넘게 조용한 버킷을 정리한다.

## CORS · 쿠키

`enableCors({ origin: CORS_ORIGINS, credentials: true, allowedHeaders: ['authorization', 'content-type', 'x-request-id'], exposedHeaders: ['x-request-id'] })`. 목록 밖 origin에는 `Access-Control-Allow-Origin`을 주지 않는다. `*`는 env 검증에서 거부한다. 서비스가 보내는 `Set-Cookie`(`onulsai_rt_web` · `onulsai_rt_admin`)는 http-proxy가 그대로 통과시킨다(`cookieDomainRewrite` 없음) — 쿠키는 Gateway 호스트에 저장되므로 웹과 Gateway는 같은 사이트여야 한다(결정 예정 Step 8).

## 실행 방법

```bash
# 루트에서
pnpm install

# 개발 서버 (watch)
pnpm --filter @oneul-sai/api-gateway dev

# 빌드 후 실행
pnpm --filter @oneul-sai/api-gateway build
pnpm --filter @oneul-sai/api-gateway start

# 검증
pnpm --filter @oneul-sai/api-gateway typecheck
pnpm --filter @oneul-sai/api-gateway lint
pnpm --filter @oneul-sai/api-gateway test
```

로컬에서 서비스(4001)를 Gateway 없이 직접 부를 때는 `.env.example`의 개발용 `INTERNAL_API_TOKEN`을 `x-internal-token` 헤더에 실어야 한다(Swagger "Try it out"도 같다). 서비스 포트는 어떤 환경에서도 외부에 열지 않는다.

## 환경 변수

`.env.example`를 복사해 `.env`를 만든다. 검증은 `src/env.schema.ts`(zod)이며 실패하면 부팅하지 않는다.

| 변수                         | 기본값                                        | 설명                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                       | `4000`                                        | 게이트웨이 포트                                                                                                                                                                                         |
| `NODE_ENV`                   | `development`                                 | `development` · `test` · `production`. 프로덕션은 아래 CORS 규칙이 엄격해진다                                                                                                                           |
| `MEMBER_SERVICE_URL`         | `http://localhost:4001`                       | member-service 주소 (`/api/v1/members`, `/api/v1/auth`)                                                                                                                                                 |
| `EVENT_SERVICE_URL`          | `http://localhost:4002`                       | event-service 주소 (`/api/v1/events`, `/api/v1/meetups`)                                                                                                                                                |
| `MATCHING_SERVICE_URL`       | `http://localhost:4003`                       | matching-service 주소                                                                                                                                                                                   |
| `NOTIFICATION_SERVICE_URL`   | `http://localhost:4004`                       | notification-service 주소(외부 라우팅 없음)                                                                                                                                                             |
| `PAYMENT_SERVICE_URL`        | `http://localhost:4005`                       | payment-service 주소                                                                                                                                                                                    |
| `JWT_ACCESS_SECRET`          | (필수)                                        | access token 검증 키(base64). **base64 디코드 길이 32바이트 이상**이어야 한다 — `openssl rand -base64 32`. member-service와 같은 값                                                                     |
| `INTERNAL_API_TOKEN`         | (필수)                                        | 프록시 요청에 붙이는 `x-internal-token`. 32자 이상. member-service와 같은 값. 교체는 두 앱에 동시 배포                                                                                                  |
| `CORS_ORIGINS`               | `http://localhost:3000,http://localhost:3001` | 허용 origin 목록(쉼표 구분, `scheme://host[:port]` 형식). `*` 금지. `NODE_ENV=production`이면 localhost가 아닌 `http://` origin이 있을 때 부팅을 거부한다. `POST /api/v1/auth/*`의 Origin 확인에도 쓴다 |
| `RATE_LIMIT_AUTH_PER_MINUTE` | `10`                                          | 위 여섯 경로의 IP당 분당 허용 횟수(양의 정수)                                                                                                                                                           |

## Swagger

- http://localhost:4000/docs — Gateway 자신의 엔드포인트(`/health`)만. 서비스 API 문서는 각 서비스의 `/docs`.

## Health

- `GET http://localhost:4000/health` — 인증 · 내부 토큰 · rate limit 대상이 아니다.
