# @oneul-sai/member-service

오늘사이 회원 도메인 서비스. (포트 4001)

## 책임

- 회원 (가입 · 프로필 · 탈퇴)
- 로그인 · 인증 (access JWT 서명, refresh 토큰 회전)
- 계정 상태 (ACTIVE · SUSPENDED · WITHDRAWN)
- 운영자 조회

이 서비스는 다른 도메인의 비즈니스 데이터를 관리하지 않는다. 현장 본인 확인 기록은 event-service의 체크인(SPEC-005)이 소유한다.
설계서: [SPEC-001 회원/인증](../../docs/specs/SPEC-001-member-auth.md).

> Step 1 구현 완료(2026-09-23). 데이터 계층 · auth · members 모듈, web · admin 화면, 문서까지 들어갔다. 검증: 단위 106 · 통합 27 · Gateway 경유 e2e 29 시나리오.

## 실행 방법

1. 데이터베이스를 먼저 띄운다 (모노레포 루트에서):

   ```bash
   docker compose up -d
   ```

2. `.env.example`을 복사해 `.env`를 만들고, 마이그레이션을 적용한 뒤 Prisma 클라이언트를 생성한다:

   ```bash
   pnpm --filter @oneul-sai/member-service exec prisma migrate dev
   pnpm --filter @oneul-sai/member-service db:generate
   ```

3. 운영자(ADMIN) 계정을 seed 한다 (아래 "seed" 절):

   ```bash
   pnpm turbo run build --filter=@oneul-sai/member-service
   pnpm --filter @oneul-sai/member-service db:seed
   ```

4. 개발 서버를 실행한다:

   ```bash
   pnpm --filter @oneul-sai/member-service dev
   ```

권고: 비밀번호 해시(scrypt)가 libuv 스레드풀(기본 4)에서 돌므로 서비스 프로세스에 `UV_THREADPOOL_SIZE=8`을 준다 (scrypt 동시 실행 4 + DB 드라이버 여유. SPEC-001 12절). Node가 읽는 변수라 `.env`가 아니라 실행 환경에서 설정한다.

## API (SPEC-001 7절)

모든 경로는 Gateway(:4000) 경유가 원칙이다. 서비스는 `/health`(정확히 일치)를 뺀 모든 핸들러에서 경로 대소문자와 무관하게 `x-internal-token`을 먼저 확인하고(없거나 다르면 401 `INTERNAL_TOKEN_INVALID`), 보호 경로에서는 Gateway가 채운 `x-user-id` · `x-user-role`만 믿는다. `Authorization` 헤더는 보지 않는다. Swagger(`/docs`)는 Nest 가드를 거치지 않는다. 가드 · 파이프 · 필터는 `@oneul-sai/service-kit`에 있다(SPEC-002 D10, ADR-010).

| 메서드 | 경로                         | 인증  | 요청                                                                       | 응답                                                      |
| ------ | ---------------------------- | ----- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| POST   | `/api/v1/members`            | 공개  | `SignupRequest`                                                            | 201 `MemberProfile`                                       |
| POST   | `/api/v1/auth/login`         | 공개  | `LoginRequest` `{ email, password, client }`                               | 200 `AuthResponse` + `Set-Cookie`                         |
| POST   | `/api/v1/auth/refresh`       | 공개  | `RefreshRequest` `{ client }` + 쿠키                                       | 200 `AuthResponse` + `Set-Cookie` (유예 응답은 쿠키 없음) |
| POST   | `/api/v1/auth/logout`        | 공개  | `LogoutRequest` `{ client }` + 쿠키                                        | 204 + 쿠키 삭제 (완전 멱등)                               |
| POST   | `/api/v1/auth/logout-all`    | 회원  | (쿠키)                                                                     | 204 + 요청에 실린 이 회원의 쿠키 삭제                     |
| POST   | `/api/v1/auth/password`      | 회원  | `ChangePasswordRequest` `{ currentPassword, newPassword }`                 | 204 (Set-Cookie 없음, 현재 가족 유지)                     |
| GET    | `/api/v1/members/me`         | 회원  | —                                                                          | 200 `MemberProfile`                                       |
| PATCH  | `/api/v1/members/me`         | 회원  | `UpdateMyProfileRequest` `{ phone?, marketingConsent?, currentPassword? }` | 200 `MemberProfile`                                       |
| DELETE | `/api/v1/members/me`         | 회원  | `WithdrawRequest` `{ password }`                                           | 204 + 두 쿠키 삭제 (즉시 익명화)                          |
| GET    | `/api/v1/members`            | ADMIN | query `MemberListQuery`                                                    | 200 `{ items: MemberSummary[], total, page, pageSize }`   |
| GET    | `/api/v1/members/:id`        | ADMIN | —                                                                          | 200 `MemberDetail`                                        |
| PATCH  | `/api/v1/members/:id/status` | ADMIN | `UpdateMemberStatusRequest` `{ status, reason? }`                          | 200 `MemberDetail`                                        |

- 스키마 · 타입 · 에러 코드 · 쿠키 이름은 모두 `@oneul-sai/contracts`에 있다. 요청은 전부 strict(모르는 필드 → 400).
- 본문을 받는 경로는 `Content-Type: application/json`만 받는다(아니면 400 `VALIDATION_FAILED`, message `content-type: application/json`). urlencoded 파서는 켜지 않는다(로그인 CSRF 차단).
- **`client` 본문 필드(`WEB` | `ADMIN`)** — login · refresh · logout이 "어느 앱에서 왔는가"를 밝힌다. 서버는 `client`가 가리키는 이름의 쿠키만 읽는다(`WEB` → `onulsai_rt_web`, `ADMIN` → `onulsai_rt_admin`). 두 쿠키가 한 브라우저에 함께 있어도(web · admin 동시 로그인) 오류가 아니다. `client: 'ADMIN'`이면 `Origin`이 env `ADMIN_ORIGIN`과 같아야 한다(login · refresh는 403 `ORIGIN_NOT_ALLOWED`, logout은 폐기 없이 204 + 쿠키 삭제). MEMBER가 `client: 'ADMIN'`으로 로그인하면 403 `ROLE_NOT_ALLOWED`.
- 쿠키: `onulsai_rt_web` `HttpOnly; Secure(COOKIE_SECURE); SameSite=Lax; Path=/api/v1/auth; Max-Age=<REFRESH_TTL>`, `onulsai_rt_admin`은 `SameSite=Strict`. Domain 속성 없음. 삭제는 같은 속성 + `Max-Age=0`. refresh 토큰은 응답 본문에 없다.
- access token: JWT HS256, 클레임 `sub`(memberId) · `role` · `iss: oneul-sai` · `aud: oneul-sai-api` · 헤더 `typ: at+jwt` · `iat` · `exp = iat + JWT_ACCESS_TTL`. Gateway와 같은 `JWT_ACCESS_SECRET`(base64) 바이트로 서명한다.
- refresh 토큰: 32바이트 랜덤(base64url 43자), DB에는 SHA-256 해시만. 회전(refresh마다 새 토큰, 옛 것은 `ROTATED`) · 유예 창 60초(같은 가족에 `ACTIVE`가 남아 있을 때만 access token만 재발급) · 유예 밖 재사용 → 가족 전체 `REVOKED(REUSE)` · 가족 절대 수명 90일 · 회원당 `ACTIVE` 가족 10개(초과 시 가장 오래된 가족 `LIMIT`). 같은 클라이언트의 유효한 쿠키를 들고 다시 로그인하면 그 가족은 `RELOGIN`으로 폐기된다.
- 로그아웃은 그 쿠키의 **가족 전체**를 `LOGOUT`으로 폐기한다. 모든 기기 로그아웃은 이 회원의 `ACTIVE` 전부. 비밀번호 변경은 요청 쿠키의 가족(`ACTIVE` 또는 유예 창 안의 `ROTATED`)만 남기고 `PASSWORD_CHANGED`로 폐기한다. 정지는 `SUSPENDED`로 전부 폐기, 탈퇴는 행 삭제.
- 모든 "회원" · "ADMIN" 경로는 호출자의 상태를 다시 읽어 `WITHDRAWN`이면 401 `UNAUTHENTICATED`, `SUSPENDED`면 403 `ACCOUNT_SUSPENDED`를 낸다(거부 목록 없이 남은 access token을 막는다).

### 에러 코드 (`ApiErrorResponse.code`)

| HTTP | code                                                                          | 언제                                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_FAILED`                                                           | Zod 실패(message는 `path: 종류`만, 입력값 없음), UUID 아님, `client` 쿠키 없음, JSON이 아닌 content-type                                                      |
| 400  | `AGE_NOT_ALLOWED` · `CONSENT_REQUIRED` · `SELF_STATUS_CHANGE`                 | `birthYear > 현재 연도 − 19` · `consents.privacy !== true` · 운영자가 자기 상태 변경                                                                          |
| 401  | `INTERNAL_TOKEN_INVALID` · `UNAUTHENTICATED`                                  | 내부 토큰 없음 · 불일치 / 보호 경로인데 `x-user-*` 없음 · 형식 오류 · `WITHDRAWN` 회원                                                                        |
| 401  | `INVALID_CREDENTIALS`                                                         | 로그인 실패(이메일 없음 · 비밀번호 불일치 — 같은 message "이메일 또는 비밀번호가 맞지 않습니다.") / 탈퇴 · 비밀번호 변경 · 휴대폰 변경의 현재 비밀번호 불일치 |
| 401  | `INVALID_REFRESH_TOKEN` · `REFRESH_TOKEN_EXPIRED` · `REFRESH_TOKEN_REUSED`    | 10절 refresh 판정 순서대로                                                                                                                                    |
| 403  | `FORBIDDEN` · `ROLE_NOT_ALLOWED` · `ORIGIN_NOT_ALLOWED` · `ACCOUNT_SUSPENDED` | 역할 부족 / `client: 'ADMIN'`인데 ADMIN 아님 / ADMIN 요청의 `Origin` 불일치 / 정지 계정                                                                       |
| 404  | `MEMBER_NOT_FOUND`                                                            | 운영자 API의 `:id` 없음(WITHDRAWN은 404가 아니라 익명화된 상세)                                                                                               |
| 409  | `EMAIL_ALREADY_EXISTS` · `INVALID_STATUS_TRANSITION`                          | Prisma P2002 / 6절 표에 없는 전이(WITHDRAWN 회원 정지 등)                                                                                                     |
| 503  | `SERVICE_BUSY`                                                                | scrypt 동시 실행 4 · 대기 큐 32 초과. `Retry-After: 1`                                                                                                        |

429 `TOO_MANY_REQUESTS`와 401 `TOKEN_EXPIRED`는 Gateway가 낸다. 423(잠금)은 없다.

### 로그인 백오프 (잠금 없음)

계정 단위. 15분 창 안에 실패가 4회 쌓이면 그 계정의 다음 확인(5번째 시도)부터 **검증 전에** `min(2^(k−5), 30)`초(k = 시도 순번)를 기다린다 — 맞는 비밀번호도 같은 시간을 기다린 뒤 통과한다. 같은 계정의 확인은 인메모리 Promise 체인(`LoginBackoffService`, 단일 인스턴스)으로 직렬화되어 병렬 추측도 줄을 선다. 지연은 `setTimeout` 대기라 DB 커넥션 · 트랜잭션을 잡지 않는다. 실패 카운터 갱신은 UPDATE 한 문장(`$queryRaw`, 15분 창 판정 + 증가). 로그인 · 탈퇴 · 비밀번호 변경 · 휴대폰 변경이 같은 카운터를 쓴다. 없는 이메일은 더미 scrypt 검증을 거쳐 같은 401을 받는다(이메일 열거 방지). ADMIN도 같다.

## 환경 변수

`.env.example`을 복사해 `.env`를 만든다. 검증은 `src/env.schema.ts`(Zod) · `src/env.ts`(`parseEnv`)가 한다. 잘못된 값이면 부팅하지 않는다.

| 변수                        | 기본값                                              | 설명                                                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                      | `4001`                                              | HTTP 서버 포트                                                                                                                                                                                                 |
| `DATABASE_URL`              | `postgresql://oneul:oneul@localhost:5432/member_db` | member_db Postgres 연결 URL                                                                                                                                                                                    |
| `NODE_ENV`                  | `development`                                       | `development` · `test` · `production`                                                                                                                                                                          |
| `JWT_ACCESS_SECRET`         | (필수)                                              | 액세스 토큰(HS256) 서명 키. **api-gateway와 같은 값.** base64 디코드 길이 32바이트 이상(`openssl rand -base64 32`)                                                                                             |
| `JWT_ACCESS_TTL`            | `900`                                               | 액세스 토큰 수명(초). 응답 `expiresIn`                                                                                                                                                                         |
| `REFRESH_TTL`               | `2592000`                                           | 리프레시 토큰 수명(초, 30일). 쿠키 `Max-Age`                                                                                                                                                                   |
| `COOKIE_SECURE`             | `true`                                              | 리프레시 쿠키 `Secure` 속성. 로컬 `.env.example`은 `false`(Safari가 `http://localhost`에서 Secure 쿠키를 거부). `NODE_ENV=production`이면 `false`를 거부                                                       |
| `INTERNAL_API_TOKEN`        | (필수)                                              | Gateway ↔ 서비스 공유 비밀(`x-internal-token`). **api-gateway와 같은 값.** 32자 이상                                                                                                                           |
| `ADMIN_ORIGIN`              | `http://localhost:3001`                             | 운영자 웹 origin. `client: 'ADMIN'`인 login · refresh · logout의 `Origin` 헤더와 비교. origin 형태로 정규화된다. `NODE_ENV=production`이면 `https://`가 아닌 값을 거부. Gateway `CORS_ORIGINS`에도 있어야 한다 |
| `SEED_ADMIN_EMAIL`          | —                                                   | seed 전용. ADMIN 이메일                                                                                                                                                                                        |
| `SEED_ADMIN_NAME`           | —                                                   | seed 전용. ADMIN 이름(1~50자)                                                                                                                                                                                  |
| `SEED_ADMIN_PASSWORD_FILE`  | —                                                   | seed 전용. 비밀번호가 든 파일 경로(마지막 줄바꿈은 제거). 우선순위 1                                                                                                                                           |
| `SEED_ADMIN_PASSWORD`       | —                                                   | seed 전용. **로컬 전용** — `NODE_ENV=production`이면 거부. 우선순위 2 (3순위는 stdin)                                                                                                                          |
| `SEED_ADMIN_RESET_PASSWORD` | `false`                                             | seed 전용. `true`면 이미 있는 ADMIN의 비밀번호를 갱신                                                                                                                                                          |

서비스 부팅에는 `SEED_*`가 필요 없다.

## 구조 (`src/`)

| 경로                                                                        | 역할                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app.ts` · `main.ts`                                                        | `createApp()`(JSON 본문 파서만, cookie-parser, 전역 예외 필터, Swagger) / 부팅. 통합 테스트는 `createApp`을 임시 포트로 띄운다                                                                                                                               |
| `app.module.ts`                                                             | 전역 가드 등록 순서: `InternalAuthGuard`(내부 토큰 → `x-user-*`) → `RolesGuard`(`@Roles('ADMIN')`)                                                                                                                                                           |
| `auth/auth.controller.ts` · `auth.service.ts`                               | login · refresh · logout · logout-all · password. 본문 `client` → 읽을 쿠키 선택, ADMIN `Origin` 판정, refresh 판정(FOR UPDATE 한 트랜잭션)                                                                                                                  |
| `auth/password.ts` · `password.service.ts`                                  | scrypt 해시 · 검증 · 더미 검증(순수 함수) / 동시 실행 4 · 대기 큐 32 · 503 `SERVICE_BUSY`                                                                                                                                                                    |
| `auth/login-backoff.service.ts`                                             | 계정 단위 직렬화 + 검증 전 지연 + 실패 카운터 한 문장 UPDATE                                                                                                                                                                                                 |
| `auth/auth.constants.ts`                                                    | 백오프 · 유예 창 · 가족 상한 · scrypt 큐 상수, `computeBackoffDelaySeconds`                                                                                                                                                                                  |
| `tokens/token.service.ts`                                                   | JWT 서명(jose), refresh 토큰 생성 · SHA-256, `FOR UPDATE` 잠금, 회전, 가족 폐기(사유별), 가족 상한                                                                                                                                                           |
| `members/members.controller.ts` · `members.service.ts` · `member-select.ts` | 가입 · me · 프로필 수정 · 탈퇴(익명화) · 운영자 목록 · 상세 · 상태 변경 / `passwordHash` 없는 Prisma `select`와 응답 매퍼                                                                                                                                    |
| `common/`                                                                   | 쿠키 helper · `assertCallerUsable`(호출자 상태 재확인) · `maskEmail` · `maskPhone`                                                                                                                                                                           |
| `@oneul-sai/service-kit` (패키지)                                           | `InternalAuthGuard` · `RolesGuard` · `@Public()` · `@Roles()` · `@CurrentUser()` · `@RequestId()` · `ZodValidationPipe` · `JsonContentTypeGuard` · `ApiHttpException` · `HttpExceptionFilter` — [packages/service-kit](../../packages/service-kit/README.md) |
| `seed/`                                                                     | ADMIN 생성 · 비밀번호 리셋                                                                                                                                                                                                                                   |
| `testing/`                                                                  | 단위 테스트 가짜 객체, 통합 테스트 앱 도우미(`TestApp`). 빌드 제외                                                                                                                                                                                           |

로그는 `@oneul-sai/logger`의 구조화 로그로 SPEC-001 14절의 이벤트 이름(`auth.login.succeeded` · `auth.login.backoff` · `auth.refresh.reuse_detected` · `member.list_viewed` 등)을 남긴다. 회원 식별은 `memberId`뿐이며 비밀번호 · 토큰 · 검색어 · `Origin` 값은 남기지 않는다.

## 데이터 (Prisma 7)

- 스키마: `prisma/schema.prisma` — `Member`(비밀번호 해시 · 로그인 실패 카운터 · 동의 시각 포함), `RefreshToken`(가족 단위 회전). 원천은 SPEC-001 9절.
- 마이그레이션: `prisma/migrations/20260922074759_init_member`. Prisma가 표현하지 못하는 CHECK 제약 `Member_required_fields`(탈퇴하지 않은 회원은 이름 필수, MEMBER는 성별 · 출생연도 · 휴대폰도 필수)를 SQL 끝에 손으로 넣었다. 되돌리기는 개발 DB에서만 `prisma migrate reset`, 적용 후는 forward fix.
- 순서: 스키마 변경 → `prisma migrate dev` → `db:generate`. 생성 클라이언트(`src/generated/`)는 커밋하지 않는다.

## seed (ADMIN)

`pnpm db:seed` = `node dist/seed/seed-admin.js` (`prisma.config.ts`의 `migrations.seed`도 같은 명령). **먼저 빌드한다**(`pnpm turbo run build --filter=@oneul-sai/member-service` — 워크스페이스 의존 패키지도 함께 빌드한다). ADMIN은 가입 API로 만들 수 없고 이 스크립트로만 만든다.

- 입력: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, 비밀번호는 `SEED_ADMIN_PASSWORD_FILE` > `SEED_ADMIN_PASSWORD`(로컬 전용) > stdin. 비밀번호 규칙은 가입과 같다(8~64자, 공백만 금지).
- upsert가 아니라 분기한다: 행 없음 → ADMIN 생성 / ADMIN 있음 → `SEED_ADMIN_RESET_PASSWORD=true`일 때만 한 트랜잭션에서 비밀번호 갱신 + 그 계정의 `ACTIVE` refresh 토큰 전부 `REVOKED`(`PASSWORD_CHANGED`) + 실패 카운터 초기화(기존 세션이 모두 끊긴다), 아니면 아무것도 하지 않음 / **MEMBER가 같은 이메일을 쓰고 있으면 실패**(exit 1, 사람이 확인한다).
- 운영 ADMIN 비밀번호 교체: `printf '%s\n' '<새 비밀번호>' > pw.txt && SEED_ADMIN_PASSWORD_FILE=pw.txt SEED_ADMIN_RESET_PASSWORD=true pnpm db:seed`, 또는 `printf '%s' '<새 비밀번호>' | SEED_ADMIN_RESET_PASSWORD=true pnpm db:seed`.
- 로직은 `src/seed/ensure-admin.ts`(`ensureAdmin`), 진입점은 `src/seed/seed-admin.ts`.

## 비밀번호 해시

`src/auth/password.ts` — `node:crypto` scrypt(N=2^17, r=8, p=1, salt 16바이트, 출력 64바이트, `maxmem` 256MiB). 저장 형식 `scrypt$N=131072,r=8,p=1$<salt b64url>$<hash b64url>`, 비교는 `timingSafeEqual`, 입력은 NFKC 정규화. 없는 이메일 · 탈퇴 표식(`withdrawn`)에는 `DUMMY_PASSWORD_HASH`로 같은 비용의 더미 검증을 돌린다(이메일 열거 방지). 동시 실행 상한 · 대기 큐(503 `SERVICE_BUSY`)는 `src/auth/password.service.ts`의 `PasswordService`가 이 함수들 위에 얹는다.

## 테스트

```bash
pnpm --filter @oneul-sai/member-service test              # 단위 (vitest, src/**/*.spec.ts, 통합 제외)
pnpm --filter @oneul-sai/member-service test:integration  # 통합 (src/**/*.integration.spec.ts, 실제 member_db)
```

단위 테스트는 Nest `TestingModule` 없이 직접 인스턴스화하고 Prisma · scrypt는 최소 가짜 객체다. 통합 테스트는 `createApp()`을 임시 포트(`127.0.0.1:0`)에 띄워 `fetch`로 부른다 — Gateway가 붙이는 `x-internal-token` · `x-user-*`를 테스트가 직접 싣는다. 시각 의존 시나리오(유예 창 · 백오프 창)는 시계를 조작하지 않고 DB의 `rotatedAt` · `lastFailedLoginAt`을 UPDATE하며, 백오프 통합 테스트는 지연 단위(`LoginBackoffService.delayUnitMs`)를 줄여 돈다.

통합 테스트는 `DATABASE_URL`의 실제 Postgres에 마이그레이션이 적용돼 있어야 하고, **각 테스트 앞에서 `Member` · `RefreshToken` 테이블을 비운다** — 로컬 개발 DB의 회원 데이터가 지워지므로 실행 뒤 `db:seed`로 ADMIN을 다시 만든다. 파일은 직렬로 돈다(`fileParallelism: false`). CI는 `postgres:17` service container를 붙인 `integration` 잡에서 돈다.

## Swagger

- http://localhost:4001/docs
- 서비스 포트를 직접 부를 때(Swagger "Try it out" 포함)는 `.env`의 `INTERNAL_API_TOKEN`을 `x-internal-token` 헤더에 실어야 한다(`/health` 제외. `/docs` 화면 자체는 토큰 없이 열린다). 보호 경로는 `x-user-id`(UUID) · `x-user-role`도 직접 채운다.

## Health

- `GET http://localhost:4001/health`
- 응답: `{ status: 'ok' | 'degraded', service, database: 'up' | 'down', timestamp }`
