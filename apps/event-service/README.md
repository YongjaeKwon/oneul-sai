# @oneul-sai/event-service

오늘사이 오프라인 소개팅 운영 도메인 서비스. (포트 4002)

## 책임

오프라인 소개팅 운영 핵심을 담당한다: Meetup(모임 상품) · Schedule(회차, 참가자 화면의 '일정') · Application · Participant · Check-in · Rotation. 모두 내부 도메인이며 별도 서비스로 분리하지 않는다.

지금 구현된 것은 Step 2([SPEC-002](../../docs/specs/SPEC-002-meetup-schedule.md))다:

- **모임 상품** `Meetup` — 제목 · 설명만. 회차가 함께 쓰는 틀이다. 등록 · 수정만 있다(상태 · 삭제 없음).
- **회차** `Schedule` — 시각(시작 · 종료 · 신청 마감), 남녀 참가비 · 정원, 남성 연령대(출생연도 범위, 선택), 장소(공개 지역 + 운영자 전용 장소 안내 넷), 상태 `DRAFT → OPEN ⇄ CLOSED → CANCELLED`(6절 전이 표). 여러 회차 한 번에 등록(D15).
- **참가자 공개 조회** — OPEN · CLOSED 회차의 공개 필드만. 정확한 장소(`venueName` · `venueAddress` · `venueDirections` · `venueMapUrl`)와 취소 사유는 공개 경로에 절대 나오지 않는다 — 경로 · select · 응답 스키마가 나뉘어 있다(SPEC-002 12절).

신청 · 좌석 계산은 Step 3, 체크인 · 로테이션은 Step 5다. 이 서비스는 다른 서비스를 부르지 않고 Kafka도 쓰지 않는다(Step 2).

## API

모든 경로는 Gateway(`:4000`) 경유다. `/health`를 뺀 모든 핸들러는 `x-internal-token`을 먼저 확인한다(`@oneul-sai/service-kit`의 `InternalAuthGuard`). 요청 · 응답 스키마는 `@oneul-sai/contracts`의 `src/event/`, 에러는 `ApiErrorResponse` + `code`. 인증 열의 원천은 컨트롤러의 `@Public()` · `@Roles('ADMIN')`이다.

| 메서드 | 경로                                                     | 인증  | 요청 → 응답                                                        |
| ------ | -------------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| GET    | `/api/v1/events`                                         | 공개  | `PublicScheduleListQuery` → `PublicScheduleListResponse`           |
| GET    | `/api/v1/events/:id`                                     | 공개  | → `PublicSchedule` (DRAFT · CANCELLED · 없음은 같은 404)           |
| GET    | `/api/v1/meetups`                                        | ADMIN | `MeetupListQuery` → `MeetupListResponse`                           |
| POST   | `/api/v1/meetups`                                        | ADMIN | `CreateMeetupRequest` → 201 `Meetup`                               |
| GET    | `/api/v1/meetups/:meetupId`                              | ADMIN | → `Meetup`                                                         |
| PATCH  | `/api/v1/meetups/:meetupId`                              | ADMIN | `UpdateMeetupRequest` → `Meetup`                                   |
| GET    | `/api/v1/meetups/:meetupId/schedules`                    | ADMIN | `AdminScheduleListQuery` → `AdminScheduleListResponse`             |
| POST   | `/api/v1/meetups/:meetupId/schedules`                    | ADMIN | `CreateScheduleRequest` → 201 `AdminSchedule`(DRAFT)               |
| POST   | `/api/v1/meetups/:meetupId/schedules/batch`              | ADMIN | `BatchCreateSchedulesRequest` → 201 `BatchCreateSchedulesResponse` |
| GET    | `/api/v1/meetups/:meetupId/schedules/:scheduleId`        | ADMIN | → `AdminSchedule`                                                  |
| PATCH  | `/api/v1/meetups/:meetupId/schedules/:scheduleId`        | ADMIN | `UpdateScheduleRequest` → `AdminSchedule`                          |
| PATCH  | `/api/v1/meetups/:meetupId/schedules/:scheduleId/status` | ADMIN | `UpdateScheduleStatusRequest` → `AdminSchedule`                    |
| DELETE | `/api/v1/meetups/:meetupId/schedules/:scheduleId`        | ADMIN | → 204 (DRAFT만)                                                    |

- `/api/v1/meetups/**` 응답에는 `Cache-Control: no-store`가 붙는다. 공개 응답은 호출자 역할과 무관하게 같다(운영자도 공개 경로에서는 비공개 필드를 받지 않는다).
- 에러 코드: 400 `VALIDATION_FAILED` · `SCHEDULE_TIME_INVALID` · `BIRTH_YEAR_RANGE_INVALID`, 401 `UNAUTHENTICATED` · `INTERNAL_TOKEN_INVALID`, 403 `FORBIDDEN`, 404 `MEETUP_NOT_FOUND` · `SCHEDULE_NOT_FOUND`, 409 `INVALID_STATUS_TRANSITION` · `SCHEDULE_NOT_EDITABLE`(SPEC-002 7절 에러 코드 표).
- 여러 회차 등록은 전부 또는 없음이다. 문제 항목은 `message`의 `items.<순번>`(0부터)으로 알린다 — Zod 실패는 `items.3.capacityMale: 범위` 형식, 시간 · 연령대 규칙 위반은 첫 위반 항목 하나를 `items.5: 시간 규칙` · `items.2: 연령대 규칙`으로 준다.
- 서비스 포트를 직접 부를 때는 `x-internal-token`(`.env`의 `INTERNAL_API_TOKEN`)을, 운영자 경로는 `x-user-id`(UUID) · `x-user-role: ADMIN`도 직접 채운다.

## 구조

| 경로                               | 역할                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/app.ts` · `src/app.module.ts` | `createApp()`(JSON 본문 파서만, 전역 필터, Swagger) · 전역 가드(내부 토큰 → 역할)                     |
| `src/events/`                      | 공개 조회만. `PUBLIC_SCHEDULE_SELECT` · `PublicScheduleSchema`만 쓴다                                 |
| `src/meetups/`                     | 운영자 상품 API                                                                                       |
| `src/schedules/`                   | 운영자 회차 API, `schedule-rules.ts`(순수 규칙 · 전이 표), `schedule-select.ts`(공개 · 운영자 select) |
| `src/common/`                      | `NoStoreInterceptor`, `dbErrorFields` · 예상 밖 에러 로그 필터, Swagger 헤더 설명                     |
| `src/testing/`                     | 통합 테스트 도우미(`TestApp`, 테스트 DB 보호). 빌드에서 제외                                          |

로그는 `@oneul-sai/logger` 구조화 로그다(`meetup.created` · `meetup.updated` · `schedule.created` · `schedule.updated` · `schedule.status_changed` · `schedule.deleted`, 식별자와 바뀐 필드 이름만). 예상 밖 에러(500)는 `request.failed`로 SQLSTATE · Prisma 코드 · 제약 이름만 남긴다 — PostgreSQL DETAIL(행 값)은 남기지 않는다(SPEC-002 12절).

## 실행 방법

1. 데이터베이스를 먼저 띄운다 (모노레포 루트에서):

   ```bash
   docker compose up -d
   ```

2. `.env`를 만들고 Prisma 클라이언트를 생성한 뒤 마이그레이션을 적용한다:

   ```bash
   cp apps/event-service/.env.example apps/event-service/.env
   pnpm --filter @oneul-sai/event-service db:generate
   pnpm --filter @oneul-sai/event-service exec prisma migrate dev   # 커밋된 마이그레이션 적용 (event_db)
   ```

3. 개발 서버를 실행한다(워크스페이스 패키지 `contracts` · `service-kit` 등이 빌드돼 있어야 한다 — 루트 `pnpm build` 또는 `pnpm dev`):

   ```bash
   pnpm --filter @oneul-sai/event-service dev
   ```

4. 확인:

   ```bash
   curl http://localhost:4002/health
   curl -H "x-internal-token: <INTERNAL_API_TOKEN>" http://localhost:4002/api/v1/events
   ```

## 환경 변수

`.env.example`을 복사해 `.env`를 만든다. 검증은 `src/env.schema.ts`.

| 변수                 | 기본값                                                  | 설명                                                                                                           |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `PORT`               | `4002`                                                  | HTTP 서버 포트                                                                                                 |
| `DATABASE_URL`       | `postgresql://oneul:oneul@localhost:5432/event_db`      | event_db Postgres 연결 URL                                                                                     |
| `NODE_ENV`           | `development`                                           | `development` · `test` · `production`                                                                          |
| `INTERNAL_API_TOKEN` | (필수, 기본값 없음)                                     | Gateway ↔ 서비스 공유 비밀(`x-internal-token`). api-gateway와 같은 값, 32자 이상                               |
| `TEST_DATABASE_URL`  | `postgresql://oneul:oneul@localhost:5432/event_test_db` | 통합 테스트 전용 DB. vitest `globalSetup`만 읽는다(서비스 부팅에는 쓰지 않음). 이름이 `_test_db`로 끝나야 한다 |

## 마이그레이션

`event_db`의 스키마는 `prisma/schema.prisma`, 마이그레이션은 `prisma/migrations/`(`init_event` · `add_application` — CHECK 제약은 SQL에만 있다). `Application`의 부분 유니크 인덱스는 Prisma `partialIndexes` 미리보기로 스키마에 선언한다 — 생성 선택자 `scheduleId_memberId`는 쓰지 않는다(기술 스택 함정 11). 테이블 · CHECK 목록은 [docs/database/README.md](../../docs/database/README.md) 6절.

## 테스트

```bash
pnpm --filter @oneul-sai/event-service test               # 단위 — .env 없이 돈다
pnpm --filter @oneul-sai/event-service test:integration   # 통합 — event_test_db
```

- 단위: `schedule-rules`(시간 · 연령대 · 전이 표 20칸), contracts 스키마 경계값(`src/event-contracts.spec.ts`), 서비스(가짜 prisma), 공개 필드 격리, DB 에러 로그.
- 통합: 앱을 임시 포트로 띄워 `fetch`로 부른다(`src/testing/integration-app.ts`, Gateway가 붙이는 헤더는 테스트가 채운다). 운영자 흐름, 공개 응답 원문에 비공개 값 · 키 이름이 없음, 404 본문 동일, 인가, 라우트 목록(기본 거부), 여러 회차 등록, 동시 수정 경합, CHECK 제약, 신청의 부분 유니크 인덱스 · CHECK · FK.
- 개발 DB `event_db`가 아니라 **테스트 전용 DB `event_test_db`**(`TEST_DATABASE_URL`)에서 돈다(SPEC-002 9절, D13). `.env`의 `DATABASE_URL`은 보지 않는다.
- `globalSetup`(`src/testing/integration.global-setup.ts`)이 실행마다 한 번 이름 검사(`_test_db`로 끝나지 않으면 즉시 실패) → `prisma migrate deploy`(적용 안 된 마이그레이션만. DB가 없으면 Prisma가 만든다) → URL을 워커에 `provide`한다.
- 각 테스트는 앞에서 `resetTestDatabase`로 `Application` · `Schedule` · `Meetup`을 비운다. 비우기 직전에 `current_database()`가 `_test_db`로 끝나는지 다시 확인한다.
- 이미 적용한 마이그레이션 파일을 고쳐 `migrate deploy`가 checksum 불일치로 실패하면 테스트 DB를 지우고 다시 실행한다(테스트 데이터뿐이다). `migrate reset`은 쓰지 않는다.

  ```bash
  docker compose exec postgres psql -U oneul -d oneul -c "DROP DATABASE event_test_db;"
  ```

## Swagger

- http://localhost:4002/docs (태그 `events` · `meetups` · `schedules`)

## Health

- `GET http://localhost:4002/health` (내부 토큰 불필요)
- 응답: `{ status: 'ok' | 'degraded', service, database: 'up' | 'down', timestamp }`
