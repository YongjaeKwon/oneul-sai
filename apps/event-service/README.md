# @oneul-sai/event-service

오늘사이 오프라인 소개팅 운영 도메인 서비스. (포트 4002)

## 책임

오프라인 소개팅 운영 핵심을 담당한다: Meetup(모임 상품) · Schedule(회차, 참가자 화면의 '일정') · Application · Participant · Check-in · Rotation. 모두 내부 도메인이며 별도 서비스로 분리하지 않는다.

지금 구현된 것은 Step 2([SPEC-002](../../docs/specs/SPEC-002-meetup-schedule.md))와 Step 3 참가 신청([SPEC-003](../../docs/specs/SPEC-003-application.md))이다:

- **모임 상품** `Meetup` — 제목 · 설명만. 회차가 함께 쓰는 틀이다. 등록 · 수정만 있다(상태 · 삭제 없음).
- **회차** `Schedule` — 시각(시작 · 종료 · 신청 마감), 남녀 참가비 · 정원, 성별 연령대(출생연도 범위 — 남 · 여 한 쌍씩, 선택, SPEC-002 개정 D16), 참가 조건 문구 · 참가비 보조 문구 · 성별 최소 인원(선택 표시 값 — 서버는 판정하지 않는다, D17), 장소(공개 지역 + 운영자 전용 장소 안내 넷), 상태 `DRAFT → OPEN ⇄ CLOSED → CANCELLED`(6절 전이 표). 여러 회차 한 번에 등록(D15).
- **참가자 공개 조회** — OPEN · CLOSED 회차의 공개 필드만. 정확한 장소(`venueName` · `venueAddress` · `venueDirections` · `venueMapUrl`)와 취소 사유는 공개 경로에 절대 나오지 않는다 — 경로 · select · 응답 스키마가 나뉘어 있다(SPEC-002 12절). 성별 최소 인원 `minPerGender`도 운영자 응답에만 있다(D17 · D20).

- **참가 신청** `Application` — 회원이 일정에 신청하면 **접수**(`APPLIED`)로 태어나고 자리를 잡지 않는다(SPEC-003 개정 2026-10-14, D14). 정원 · 연령은 보지 않는다(D15). 운영자가 **참가 가능 안내**(`PATCH …/status { status: 'PENDING' }`)를 하면 그때 그 성별의 자리를 잡고 입금 대기(`PENDING`)가 된다 — 회차 행 → 신청 행을 `FOR UPDATE`로 잠근 뒤 자리 잡은 수(`PENDING` · `CONFIRMED`)를 세어 정원을 넘지 않는다(D16, 잠금 한 번의 대기 `lock_timeout` 2초 — 요청 하나는 최대 약 4초, SPEC-003 17절). 참가 확정(`CONFIRMED`)은 `payment.completed.v1` 소비자(SPEC-004 5번 PR)가 만든다 — 이 서비스에 확정을 만드는 API는 없다. 본인 취소(접수는 언제든, 입금 대기는 신청 마감 전, 참가 확정은 불가) · 운영자 취소(언제든) · 회차 취소 연쇄(활성 전부 — 접수 포함). 입금 기한은 두지 않는다(SPEC-004 D12).

신청할 때 member-service `GET /api/v1/members/me`를 한 번 부른다(위임 호출, [ADR-011](../../docs/adr/ADR-011-service-to-service-calls.md)) — **신청은 member-service가 떠 있어야 된다**(없으면 503 `SERVICE_BUSY`). 체크인 · 로테이션은 Step 5다. Kafka는 쓰지 않는다.

## API

모든 경로는 Gateway(`:4000`) 경유다. `/health`를 뺀 모든 핸들러는 `x-internal-token`을 먼저 확인한다(`@oneul-sai/service-kit`의 `InternalAuthGuard`). 요청 · 응답 스키마는 `@oneul-sai/contracts`의 `src/event/`, 에러는 `ApiErrorResponse` + `code`. 인증 열의 원천은 컨트롤러의 `@Public()` · `@Roles('ADMIN')` · `@Roles('MEMBER')`이다.

| 메서드 | 경로                                                                                 | 인증   | 요청 → 응답                                                                                                 |
| ------ | ------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/events`                                                                     | 공개   | `PublicScheduleListQuery` → `PublicScheduleListResponse`                                                    |
| GET    | `/api/v1/events/:id`                                                                 | 공개   | → `PublicSchedule` (DRAFT · CANCELLED · 없음은 같은 404)                                                    |
| GET    | `/api/v1/meetups`                                                                    | ADMIN  | `MeetupListQuery` → `MeetupListResponse`                                                                    |
| POST   | `/api/v1/meetups`                                                                    | ADMIN  | `CreateMeetupRequest` → 201 `Meetup`                                                                        |
| GET    | `/api/v1/meetups/:meetupId`                                                          | ADMIN  | → `Meetup`                                                                                                  |
| PATCH  | `/api/v1/meetups/:meetupId`                                                          | ADMIN  | `UpdateMeetupRequest` → `Meetup`                                                                            |
| GET    | `/api/v1/meetups/:meetupId/schedules`                                                | ADMIN  | `AdminScheduleListQuery` → `AdminScheduleListResponse`                                                      |
| POST   | `/api/v1/meetups/:meetupId/schedules`                                                | ADMIN  | `CreateScheduleRequest` → 201 `AdminSchedule`(DRAFT)                                                        |
| POST   | `/api/v1/meetups/:meetupId/schedules/batch`                                          | ADMIN  | `BatchCreateSchedulesRequest` → 201 `BatchCreateSchedulesResponse`                                          |
| GET    | `/api/v1/meetups/:meetupId/schedules/:scheduleId`                                    | ADMIN  | → `AdminSchedule`                                                                                           |
| PATCH  | `/api/v1/meetups/:meetupId/schedules/:scheduleId`                                    | ADMIN  | `UpdateScheduleRequest` → `AdminSchedule`                                                                   |
| PATCH  | `/api/v1/meetups/:meetupId/schedules/:scheduleId/status`                             | ADMIN  | `UpdateScheduleStatusRequest` → `AdminSchedule`                                                             |
| DELETE | `/api/v1/meetups/:meetupId/schedules/:scheduleId`                                    | ADMIN  | → 204 (DRAFT만)                                                                                             |
| POST   | `/api/v1/applications`                                                               | MEMBER | `CreateApplicationRequest` → 201 `MyApplication`                                                            |
| GET    | `/api/v1/applications`                                                               | MEMBER | `MyApplicationListQuery` → `MyApplicationListResponse`                                                      |
| PATCH  | `/api/v1/applications/:applicationId/status`                                         | MEMBER | `UpdateApplicationStatusRequest` → `MyApplication`                                                          |
| GET    | `/api/v1/meetups/:meetupId/schedules/:scheduleId/applications`                       | ADMIN  | `AdminApplicationListQuery` → `AdminApplicationListResponse`                                                |
| PATCH  | `/api/v1/meetups/:meetupId/schedules/:scheduleId/applications/:applicationId/status` | ADMIN  | `AdminUpdateApplicationStatusRequest`(`PENDING` = 참가 가능 안내 · `CANCELLED` = 취소) → `AdminApplication` |

- `/api/v1/meetups/**`와 `/api/v1/applications/**` 응답에는 `Cache-Control: no-store`가 붙는다. 신청 경로는 MEMBER만(ADMIN은 403). 공개 응답은 호출자 역할과 무관하게 같다(운영자도 공개 경로에서는 비공개 필드를 받지 않는다).
- 에러 코드: 400 `VALIDATION_FAILED` · `SCHEDULE_TIME_INVALID` · `BIRTH_YEAR_RANGE_INVALID`, 401 `UNAUTHENTICATED` · `INTERNAL_TOKEN_INVALID`, 403 `FORBIDDEN` · `ACCOUNT_SUSPENDED`(신청 — 위임 호출이 정지 계정을 알림), 404 `MEETUP_NOT_FOUND` · `SCHEDULE_NOT_FOUND` · `APPLICATION_NOT_FOUND`, 409 `INVALID_STATUS_TRANSITION`(회차 상태 전이, 참가 가능 안내의 CONFIRMED · CANCELLED 신청) · `SCHEDULE_NOT_EDITABLE` · `CAPACITY_BELOW_APPLICATIONS`(회차 수정에서 정원 < 그 성별 **자리 잡은** 신청 수 — 접수는 세지 않는다) · 신청 `APPLICATION_CLOSED` · `ALREADY_APPLIED` · `REAPPLY_NOT_ALLOWED` · `PENDING_APPLICATION_LIMIT`(이 순서의 첫 코드 — 정원 · 연령 코드는 없다) · 참가 가능 안내 `SCHEDULE_FULL`(그 성별의 자리 잡은 수 ≥ 정원) · 본인 취소 `APPLICATION_NOT_CANCELLABLE`(입금 대기 · 신청 마감 뒤) · `APPLICATION_CONFIRMED`(참가 확정, SPEC-004), 503 `SERVICE_BUSY` + `Retry-After: 1`(회차 쓰기 · 신청 · 취소 · 참가 가능 안내가 잠금 · 트랜잭션 연결을 기다리다 끝남, 또는 신청의 위임 호출 실패)(SPEC-002 · SPEC-003 · SPEC-004 7절 에러 코드 표).
- 운영자 회차 응답에는 모두 여섯 값 — 자리 잡은 수 `appliedMale` · `appliedFemale`(`PENDING` · `CONFIRMED`), 접수 수 `receivedMale` · `receivedFemale`(`APPLIED`), `maleFull` · `femaleFull`(자리 잡은 수 ≥ 정원) — 이 실린다. **공개 응답에는 신청 관련 값이 없다**(SPEC-003 D17, ★S2 — 공개 조회는 신청 테이블을 읽지 않는다). 회차를 취소하면 같은 트랜잭션에서 그 회차의 활성 신청(접수 · 입금 대기 · 참가 확정)이 모두 취소된다(`cancelledBy: SCHEDULE`).
- 여러 회차 등록은 전부 또는 없음이다. 문제 항목은 `message`의 `items.<순번>`(0부터)으로 알린다 — Zod 실패는 `items.3.capacityMale: 범위` 형식, 시간 · 연령대 규칙 위반은 첫 위반 항목 하나를 `items.5: 시간 규칙` · `items.2: 연령대 규칙`으로 준다.
- 연령대 순서(`min ≤ max`)는 병합한 값으로 성별마다 본다 — 남 · 여 어느 쌍이 어긋나도 400 `BIRTH_YEAR_RANGE_INVALID`이고, 남녀 사이의 관계는 보지 않는다(D16). 최소 인원과 정원의 비교는 서버에 없다 — 운영자 화면이 경고만 한다(D17).
- 서비스 포트를 직접 부를 때는 `x-internal-token`(`.env`의 `INTERNAL_API_TOKEN`)을, 운영자 경로는 `x-user-id`(UUID) · `x-user-role: ADMIN`도, 신청 경로는 `x-user-id` · `x-user-role: MEMBER`를 직접 채운다(신청은 그 헤더 그대로 member-service를 부르므로 member_db에 있는 회원 ID여야 한다).

## 구조

| 경로                               | 역할                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app.ts` · `src/app.module.ts` | `createApp()`(JSON 본문 파서만, 전역 필터, Swagger) · 전역 가드(내부 토큰 → 역할)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/events/`                      | 공개 조회만. `PUBLIC_SCHEDULE_SELECT` · `PublicScheduleSchema`만 쓴다 — 신청 테이블을 읽지 않는다(SPEC-003 D17)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/meetups/`                     | 운영자 상품 API                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/schedules/`                   | 운영자 회차 API, `schedule-rules.ts`(순수 규칙 · 전이 표), `schedule-select.ts`(공개 · 운영자 select)                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/members/`                     | `member-client.ts` — 위임 호출 하나(`GET /api/v1/members/me`, 3초, (상태, code) 쌍 해석, ADR-011) · `MembersModule`(통합 테스트는 가짜를 넣는다)                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/applications/`                | 회원 · 운영자 신청 컨트롤러(운영자 `PATCH` 하나가 본문 `status`로 참가 가능 안내 · 취소를 가른다), `applications.service.ts`(잠금 뒤 판정 · 저장 — `apply` · `cancelMine` · `inviteByAdmin` · `cancelByAdmin`), `application-rules.ts`(순수 판정 — `decideApply` D15 순서 · `decideCancel` · `decideInvite`), `application-queries.ts`(집합 둘 — 활성 `ACTIVE_APPLICATION_WHERE` · 자리 잡은 `SEATED_APPLICATION_WHERE`, `countSeated` · `cancelActiveForSchedule` · `seatCountsBySchedule` · `seatsOf` — 회차 모듈은 이것만 부른다, SPEC-003 10절) |
| `src/common/`                      | `NoStoreInterceptor`, `dbErrorFields` · 예상 밖 에러 로그 필터, `db-lock.ts`(`lock_timeout` 2초 · 55P03/P2028 → 503), Swagger 헤더 설명                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/testing/`                     | 통합 테스트 도우미(`TestApp`, 테스트 DB 보호). 빌드에서 제외                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

로그는 `@oneul-sai/logger` 구조화 로그다(`meetup.created` · `meetup.updated` · `schedule.created` · `schedule.updated` · `schedule.status_changed`(→ CANCELLED면 `cancelledApplications`) · `schedule.deleted`, 식별자와 바뀐 필드 이름만). 회차 쓰기가 503으로 끝나면 warn `schedule.busy`(meetupId · scheduleId · cause `lock_timeout`|`pool` · requestId)를 남긴다. 신청은 `application.created` · `application.rejected`(409만, 회원 ID 없이 code — 참가 가능 안내의 409는 adminId · applicationId · code) · `application.invited`(참가 가능 안내 — adminId · applicationId · scheduleId) · `application.cancelled`(by `MEMBER`|`ADMIN`, 운영자 취소는 `wasConfirmed` — SPEC-004 6절) · `application.list_viewed`(운영자 목록) · 503이면 warn `application.busy`(scheduleId — 본인 취소는 잠금 전에 회차를 몰라 applicationId · cause · requestId), 위임 호출 실패는 `application.member_lookup_failed`(SPEC-003 14절). 예상 밖 에러(500)는 `request.failed`로 SQLSTATE · Prisma 코드 · 제약 이름만 남긴다 — PostgreSQL DETAIL(행 값)은 남기지 않는다(SPEC-002 12절).

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
| `MEMBER_SERVICE_URL` | `http://localhost:4001`(development · test)             | 위임 호출 대상 member-service 주소(ADR-011). **production은 기본값 없이 필수** — 없으면 부팅하지 않는다        |
| `TEST_DATABASE_URL`  | `postgresql://oneul:oneul@localhost:5432/event_test_db` | 통합 테스트 전용 DB. vitest `globalSetup`만 읽는다(서비스 부팅에는 쓰지 않음). 이름이 `_test_db`로 끝나야 한다 |

## 마이그레이션

`event_db`의 스키마는 `prisma/schema.prisma`, 마이그레이션은 `prisma/migrations/`(`init_event` · `add_application` — CHECK 제약은 SQL에만 있다 — · `add_application_statuses` — `ApplicationStatus`에 `CONFIRMED` · `APPLIED`를 `ADD VALUE`로 더하고 기본값을 `APPLIED`로. Prisma는 마이그레이션 파일을 트랜잭션으로 감싸지 않아 새 값을 쓰는 `SET DEFAULT`가 같은 파일에 있다 — psql로 손수 적용할 때 `BEGIN … COMMIT`으로 감싸면 55P04로 실패한다, SPEC-003 17절 — · `add_schedule_condition_columns` — `Schedule`에 nullable 열 다섯(`femaleMinBirthYear` · `femaleMaxBirthYear` · `participantCondition` · `priceNote` · `minPerGender`, DB 기본값 없음 — 기존 행은 NULL)과 CHECK `Schedule_female_birth_year_valid` · `Schedule_min_per_gender_valid`, SPEC-002 개정 9절). `Application`의 부분 유니크 인덱스는 Prisma `partialIndexes` 미리보기로 스키마에 선언한다 — 생성 선택자 `scheduleId_memberId`는 쓰지 않는다(기술 스택 함정 11). enum 값 순서는 `ADD VALUE` 순서(`PENDING` · `CANCELLED` · `CONFIRMED` · `APPLIED`)이고 `schema.prisma` · contracts `APPLICATION_STATUSES`도 같다 — `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma`가 비어 있어야 한다. 테이블 · CHECK 목록은 [docs/database/README.md](../../docs/database/README.md) 6절.

## 테스트

```bash
pnpm --filter @oneul-sai/event-service test               # 단위 — .env 없이 돈다
pnpm --filter @oneul-sai/event-service test:integration   # 통합 — event_test_db
```

- 단위: `schedule-rules`(시간 · 성별 연령대 · 전이 표 20칸), `application-rules`(`decideApply` 순서 · 경계, `decideCancel` · `decideInvite` 전이 표), `application-queries`(집합 둘 · 집계 가르기), contracts 스키마 경계값(`src/event-contracts.spec.ts` — `APPLICATION_STATUSES`와 Prisma enum의 값 · 순서 비교 포함), 서비스(가짜 prisma — 신청은 잠금 → 판정 → 저장 순서, 참가 가능 안내는 회차 행 → 신청 행 잠금 → 별도 집계 → UPDATE), `member-client`(응답 해석 표 — `birthYear`를 받지 않는다), 공개 필드 격리, DB 에러 로그.
- 통합: 앱을 임시 포트로 띄워 `fetch`로 부른다(`src/testing/integration-app.ts`, Gateway가 붙이는 헤더는 테스트가 채운다). 운영자 흐름, 공개 응답 원문에 비공개 값 · 키 이름(신청 관련 값 포함)이 없음, 404 본문 동일, 인가, 라우트 목록(기본 거부), 여러 회차 등록, 동시 수정 경합, CHECK 제약, 신청의 부분 유니크 인덱스 · CHECK · FK · enum 값 넷 · 기본값 `APPLIED`, 회차 쪽 신청 규칙(정원 축소 409는 자리 잡은 수 기준 · 회차 취소 연쇄에 접수 포함 · 회원 취소와의 순서 강제 · 잠금 대기 초과 503 · 응답의 여섯 값), 신청 API(접수 흐름 · 참가 가능 안내 · 거절 코드 · 확정 뒤 규칙(DB에서 직접 CONFIRMED) · 인가 · 위임 호출 실패 시 행 0건 — 회원 조회는 가짜 `FakeMembers`), 동시성(`applications-concurrency.integration.spec.ts` — 참가 가능 안내의 마지막 한 자리 · 정원 축소 · 몰림, 신청 몰림은 전부 201, 같은 회원 중복, 순서 강제).
- 잠금 순서 강제 테스트는 테스트 쪽 트랜잭션이 행을 `FOR UPDATE`로 잡은 채 요청을 보내고, `pg_locks`로 요청이 실제로 기다리는지 확인한 뒤 커밋한다(SPEC-003 D13).
- 개발 DB `event_db`가 아니라 **테스트 전용 DB `event_test_db`**(`TEST_DATABASE_URL`)에서 돈다(SPEC-002 9절, D13). `.env`의 `DATABASE_URL`은 보지 않는다.
- `globalSetup`(`src/testing/integration.global-setup.ts`)이 실행마다 한 번 이름 검사(`_test_db`로 끝나지 않으면 즉시 실패) → `prisma migrate deploy`(적용 안 된 마이그레이션만. DB가 없으면 Prisma가 만든다) → URL을 워커에 `provide`한다.
- 각 테스트는 앞에서 `resetTestDatabase`로 `Application` · `Schedule` · `Meetup`을 비운다. 비우기 직전에 `current_database()`가 `_test_db`로 끝나는지 다시 확인한다.
- 이미 적용한 마이그레이션 파일을 고쳐 `migrate deploy`가 checksum 불일치로 실패하면 테스트 DB를 지우고 다시 실행한다(테스트 데이터뿐이다). `migrate reset`은 쓰지 않는다.

  ```bash
  docker compose exec postgres psql -U oneul -d oneul -c "DROP DATABASE event_test_db;"
  ```

## Swagger

- http://localhost:4002/docs (태그 `events` · `meetups` · `schedules` · `applications` · `admin-applications`)

## Health

- `GET http://localhost:4002/health` (내부 토큰 불필요)
- 응답: `{ status: 'ok' | 'degraded', service, database: 'up' | 'down', timestamp }`
