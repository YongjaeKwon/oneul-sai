# 데이터베이스

DB 소유권, Prisma 7 워크플로우, 마이그레이션 규칙, 그리고 실제로 있는 테이블의 인덱스다. 스키마의 원천은 `apps/<service>/prisma/schema.prisma`이고, 이 문서와 다르면 스키마가 맞다.

- 상태: 확정
- 최종 갱신: 2026-09-23 (Step 2 — event_db 첫 마이그레이션 `init_event`, 테스트 전용 DB `event_test_db`. seed 전 빌드를 `turbo run build`로)

## 1. Database per Service

각 서비스는 자신의 논리 Database만 소유한다. 다른 서비스의 DB에 직접 접근(쿼리, FK 참조 포함)하는 것은 금지이며, 다른 서비스의 데이터가 필요하면 REST 호출 또는 Kafka 이벤트로만 얻는다. 개발 환경에서는 PostgreSQL 인스턴스 하나를 공유하되 논리 DB로 소유권을 분리한다. (ADR-007 참고)

| 서비스               | 논리 DB           | 기본 URL                                                  | 상태                                    |
| -------------------- | ----------------- | --------------------------------------------------------- | --------------------------------------- |
| member-service       | `member_db`       | `postgresql://oneul:oneul@localhost:5432/member_db`       | Step 1 — `Member` · `RefreshToken`(5절) |
| event-service        | `event_db`        | `postgresql://oneul:oneul@localhost:5432/event_db`        | Step 2 — `Meetup` · `Schedule`(6절)     |
| matching-service     | `matching_db`     | `postgresql://oneul:oneul@localhost:5432/matching_db`     | 최소 스키마(모델 없음). Step 6          |
| notification-service | `notification_db` | `postgresql://oneul:oneul@localhost:5432/notification_db` | 최소 스키마(모델 없음). Step 7          |
| payment-service      | `payment_db`      | `postgresql://oneul:oneul@localhost:5432/payment_db`      | 최소 스키마(모델 없음). Step 4          |

- 실제 접속 URL은 각 서비스 디렉토리의 `.env`(`DATABASE_URL`)로 주입한다. 루트 `.env.example`에는 `<SERVICE>_DATABASE_URL` 이름으로 전체 목록이 있다.
- 테이블 이름은 Prisma 기본(모델명 그대로, `@@map` 없음)을 쓴다. 다른 서비스가 이 테이블을 볼 일이 없기 때문이다(ADR-007).

## 2. 로컬 실행

```bash
# 저장소 루트에서
docker compose up -d
```

- PostgreSQL 17 컨테이너(`oneul-sai-postgres`)가 5432 포트로 뜬다. 계정은 `oneul` / `oneul`.
- 최초 기동 시 init 스크립트(`infra/docker/postgres/init/01-create-databases.sql`)가 위 표의 논리 DB 5개를 생성한다.
- init 스크립트는 데이터 볼륨이 비어 있을 때만 실행된다. DB 목록을 바꿨다면 볼륨을 지우고 다시 올린다(`docker compose down -v`).
- 테스트 전용 DB `event_test_db`(4.2절)는 init 스크립트에 없다. event-service `test:integration`의 `prisma migrate deploy`가 DB가 없으면 만든다(Prisma 7.10에서 확인) — 기존 볼륨에서도 따로 만들 필요가 없다.

## 3. Prisma 7 워크플로우

각 백엔드 서비스는 Prisma를 서비스 디렉토리 안에서 독립적으로 관리한다.

- 스키마 위치: `apps/<service>/prisma/schema.prisma`. `generator client { provider = "prisma-client", output = "../src/generated/prisma" }`, datasource에 url 없음.
- 설정: `apps/<service>/prisma.config.ts` — Prisma 7은 `.env`를 자동 로드하지 않으므로, 이 파일에서 `dotenv`로 해당 서비스의 `.env`를 로드하고 `datasource.url`과 `migrations.seed`를 넘긴다.
- 클라이언트 생성:

  ```bash
  pnpm --filter @oneul-sai/member-service db:generate
  # 전체 서비스 일괄 생성
  pnpm db:generate
  ```

- 생성된 클라이언트는 `apps/<service>/src/generated/prisma/`에 출력되며 **gitignore 대상**이다. clone 직후에는 `db:generate`를 먼저 실행해야 타입체크/빌드가 통과한다(turbo가 `build`/`dev`/`typecheck`/`test` 전에 `db:generate`를 실행하도록 이미 연결돼 있다).
- 런타임 연결은 `@prisma/adapter-pg`(driver adapter)를 사용한다. 패턴은 `apps/member-service/src/prisma/prisma.service.ts`를 그대로 따른다.
- 알려진 함정(`.env` 미로드, adapter 필수 등)은 [기술 스택 함정 4](../architecture/tech-stack.md#함정-4-prisma-7은-옛-prisma와-여러-곳이-다르다).

## 4. 마이그레이션

마이그레이션은 **실제 도메인 모델을 추가하는 Step**에서 그 서비스에 시작한다. 첫 사례는 Step 1의 member-service `20260922074759_init_member`(5절), 다음은 Step 2의 event-service `20260923014911_init_event`(6절)다. 나머지 서비스는 클라이언트 생성 확인용 최소 스키마이며 마이그레이션 파일이 없다 — 각 Step의 설계서 "9. DB 변경" 절과 함께 시작한다.

### 4.1 개발 (`prisma migrate dev`)

```bash
# 1. schema.prisma 수정
# 2. 마이그레이션 생성 + 로컬 DB 적용 + 클라이언트 재생성
pnpm --filter @oneul-sai/member-service exec prisma migrate dev --name <설명>
# 3. (turbo 밖에서 직접 돌렸다면) 클라이언트 재생성
pnpm --filter @oneul-sai/member-service db:generate
```

- 순서는 항상 **스키마 변경 → `migrate dev` → `db:generate`**. 마이그레이션 SQL(`prisma/migrations/<timestamp>_<name>/migration.sql`)은 커밋한다.
- Prisma 스키마가 표현하지 못하는 제약(CHECK 등)은 `prisma migrate dev --create-only --name <name>`로 SQL만 만든 뒤 `migration.sql` 끝에 손으로 추가하고, 다시 `prisma migrate dev`로 적용한다. 마이그레이션 SQL에만 있는 제약은 drift로 잡히지 않는다. 첫 사례: `Member_required_fields`(5절).
- 되돌리기: 적용 전(개발 DB)은 `prisma migrate reset`(데이터가 지워진다). 적용 후는 **forward fix**(되돌리는 내용의 새 마이그레이션). 별도 `down.sql`은 두지 않는다 — 아무 도구도 실행 · 검증하지 않는 파일을 관례로 만들지 않는다. 회원이 한 명이라도 가입한 뒤에는 `init_member`를 되돌리지 않는다.

### 4.2 배포 · CI (`prisma migrate deploy`)

```bash
pnpm --filter @oneul-sai/member-service exec prisma migrate deploy
```

- `deploy`는 커밋된 마이그레이션을 순서대로 적용만 한다(생성 · drift 감지 · reset 없음). 프로덕션과 CI는 이것만 쓴다. 프로덕션 배포 절차 자체는 결정 예정 (Step 8).
- member-service 통합 테스트(`*.integration.spec.ts`, `pnpm --filter @oneul-sai/member-service test:integration`)는 `DATABASE_URL`의 실제 Postgres에 `migrate deploy`가 적용돼 있어야 한다. CI는 `integration` 잡의 `postgres:17` service container에 `migrate deploy` → `test:integration` 순서로 돈다(`.github/workflows/ci.yml`). 통합 테스트는 각 테스트 앞에서 테이블을 비우므로 **로컬 개발 DB에서 돌리면 회원 데이터가 지워진다** — 실행 뒤 seed를 다시 한다. 테스트 전용 DB로 옮길지는 결정 예정(SPEC-002 16절).

#### 테스트 전용 DB `event_test_db` (SPEC-002 9절, D13)

event-service 통합 테스트는 개발 DB `event_db`를 건드리지 않고 **테스트 전용 DB**에서 돈다.

```bash
pnpm --filter @oneul-sai/event-service test:integration
```

- URL의 원천은 env `TEST_DATABASE_URL`(기본 `postgresql://oneul:oneul@localhost:5432/event_test_db`) 하나이고, vitest `globalSetup`(`apps/event-service/src/testing/integration.global-setup.ts`)만 읽는다. 서비스 부팅과 `.env`의 `DATABASE_URL`은 관여하지 않는다.
- `globalSetup`이 실행마다 한 번: 이름 검사(`_test_db`로 끝나지 않으면 즉시 실패 — `event_db` · `member_db` 거부) → `prisma migrate deploy`(비파괴, `DATABASE_URL`만 테스트 URL로 바꾼 자식 프로세스. DB가 없으면 Prisma가 만든다) → `provide('testDatabaseUrl')`로 워커에 넘긴다.
- 워커는 `inject('testDatabaseUrl')`로 받은 URL로만 `PrismaService`를 만든다. 각 테스트 앞의 `resetTestDatabase`는 `SELECT current_database()`가 `_test_db`로 끝나는지 확인한 뒤에만 `TRUNCATE "Schedule", "Meetup"`을 한다.
- `prisma migrate reset`은 쓰지 않는다. 이미 적용한 마이그레이션 파일을 고쳐 checksum이 어긋나면(`migrate deploy` 실패) 사람이 테스트 DB를 지우고 다시 실행한다: `docker compose exec postgres psql -U oneul -d oneul -c "DROP DATABASE event_test_db;"`(테스트 데이터뿐이다).
- CI `integration` 잡은 member-service 다음에 event-service `build`(`db:generate` 포함) → `test:integration`을 단계 env `TEST_DATABASE_URL=postgresql://oneul:oneul@localhost:5432/event_test_db`로 돈다. 잡 env의 `DATABASE_URL`(member_db)은 그대로이고 event-service 테스트는 그것을 보지 않는다.

### 4.3 seed

- ADMIN(운영자) 계정은 가입 API로 만들 수 없고 seed로만 만든다: `pnpm turbo run build --filter=@oneul-sai/member-service && pnpm --filter @oneul-sai/member-service db:seed`(`node dist/seed/seed-admin.js`, `prisma.config.ts`의 `migrations.seed`도 같은 명령).
- 입력은 env `SEED_ADMIN_EMAIL` · `SEED_ADMIN_NAME`, 비밀번호는 `SEED_ADMIN_PASSWORD_FILE`(파일) > `SEED_ADMIN_PASSWORD`(로컬 전용) > stdin. upsert가 아니라 분기한다(없으면 생성 / ADMIN이 있으면 `SEED_ADMIN_RESET_PASSWORD=true`일 때만 비밀번호 갱신 + 그 계정의 세션 전부 폐기 / MEMBER가 같은 이메일이면 실패). 상세는 [apps/member-service/README.md](../../apps/member-service/README.md) "seed" 절.
- 시드 데이터는 운영자 계정뿐이다. 테스트용 회원 데이터 seed는 두지 않는다(통합 테스트가 자기 데이터를 만든다).

### 4.4 로컬 처음 세팅 순서

```bash
docker compose up -d
cp apps/member-service/.env.example apps/member-service/.env
cp apps/event-service/.env.example apps/event-service/.env
pnpm --filter @oneul-sai/member-service exec prisma migrate dev   # 커밋된 마이그레이션 적용 (member_db)
pnpm --filter @oneul-sai/event-service exec prisma migrate dev    # 커밋된 마이그레이션 적용 (event_db)
pnpm db:generate
pnpm turbo run build --filter=@oneul-sai/member-service && pnpm --filter @oneul-sai/member-service db:seed
```

## 5. member_db (Step 1, SPEC-001 9절)

원천: `apps/member-service/prisma/schema.prisma`, 마이그레이션 `prisma/migrations/20260922074759_init_member/migration.sql`. 설계 이유는 [SPEC-001 5 · 9절](../specs/SPEC-001-member-auth.md#9-db-변경), 결정은 [ADR-009](../adr/ADR-009-authentication.md).

| 마이그레이션                 | 내용                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `20260922074759_init_member` | enum 6개, `Member`, `RefreshToken`, 인덱스, FK, 손으로 추가한 CHECK `Member_required_fields` |

### `Member` — 회원 (역할 `MEMBER` · `ADMIN` 같은 테이블)

| 열                                                               | 타입 · 제약                                        | 뜻                                                                                                                               |
| ---------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                             | `TEXT` PK, UUID                                    | 회원 식별자. 다른 서비스가 참조하는 값(REST · 이벤트로만)                                                                        |
| `email`                                                          | `TEXT` **UNIQUE**                                  | 로그인 식별자. trim · 소문자 정규화 저장. 탈퇴 시 `withdrawn+<id>@invalid`                                                       |
| `passwordHash`                                                   | `TEXT` NOT NULL                                    | scrypt 저장 형식 `scrypt$N=131072,r=8,p=1$<salt>$<hash>`. 탈퇴 시 표식값 `withdrawn`. 별도 `Credential` 테이블 없음(D1)          |
| `name` · `gender` · `birthYear` · `phone`                        | nullable (`Gender` enum, `INTEGER`, `TEXT`)        | 실명 · 성별 · 출생연도 · 휴대폰(숫자만). ADMIN은 성별 · 출생연도 · 휴대폰 없음. 탈퇴 시 모두 null. **`phone`은 unique가 아니다** |
| `role`                                                           | `MemberRole` DEFAULT `MEMBER`                      | ADMIN은 seed로만 생성                                                                                                            |
| `status` · `statusReason`                                        | `AccountStatus` DEFAULT `ACTIVE` · `TEXT` nullable | 활성 / 정지 / 탈퇴. 정지 · 해제 사유                                                                                             |
| `failedLoginCount` · `lastFailedLoginAt`                         | `INTEGER` DEFAULT 0 · `TIMESTAMP(3)` nullable      | 로그인 백오프 카운터(15분 창). 로그인 · 탈퇴 · 비밀번호 변경 · 휴대폰 변경의 비밀번호 실패가 함께 올린다. 잠금 열은 없다         |
| `privacyAgreedAt` · `marketingAgreedAt` · `marketingWithdrawnAt` | `TIMESTAMP(3)` NOT NULL · nullable · nullable      | 동의 기록. 필수 동의는 가입 시각, 마케팅은 동의 중이면 값 있음 · 철회 시각은 이력으로 남음                                       |
| `withdrawnAt`                                                    | `TIMESTAMP(3)` nullable                            | 탈퇴 시각(증빙)                                                                                                                  |
| `createdAt` · `updatedAt`                                        | `TIMESTAMP(3)`                                     | 생성 · 갱신 시각                                                                                                                 |

- 인덱스: `Member_email_key`(unique), `Member_status_idx`, `Member_createdAt_idx`, `Member_phone_idx`(운영자 목록 · 검색용).
- CHECK `Member_required_fields`(마이그레이션 SQL에만 있음): `status = 'WITHDRAWN'` 이거나, `name IS NOT NULL` 이고 (`role <> 'MEMBER'` 이거나 `gender` · `birthYear` · `phone` 모두 NOT NULL). 즉 탈퇴하지 않은 회원은 이름이 있어야 하고, MEMBER는 성별 · 출생연도 · 휴대폰도 있어야 한다.

### `RefreshToken` — 리프레시 토큰 (세션은 `familyId` 단위)

| 열                                      | 타입 · 제약                           | 뜻                                                                          |
| --------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `id`                                    | `TEXT` PK, UUID                       |                                                                             |
| `memberId`                              | `TEXT` FK → `Member.id` (RESTRICT)    | 소유 회원. 탈퇴 시 이 회원의 행을 삭제한다                                  |
| `familyId` · `familyStartedAt`          | `TEXT` · `TIMESTAMP(3)`               | 로그인 한 번 = 가족 하나. 회전해도 같은 값. 절대 수명 90일                  |
| `client`                                | `ClientType` (`WEB` · `ADMIN`)        | 발급한 앱. refresh · logout 본문 `client`와 같아야 한다                     |
| `tokenHash`                             | `TEXT` **UNIQUE**                     | 토큰 원문의 SHA-256. 원문은 저장하지 않는다                                 |
| `status`                                | `RefreshTokenStatus` DEFAULT `ACTIVE` | `ACTIVE` → `ROTATED`(회전) 또는 `REVOKED`(폐기)                             |
| `expiresAt` · `rotatedAt` · `revokedAt` | `TIMESTAMP(3)`                        | 만료(30일) · 회전 · 폐기 시각. 유예 창 판정은 `rotatedAt` 기준 60초         |
| `revokedReason`                         | `RevokedReason` nullable              | `LOGOUT` · `RELOGIN` · `LIMIT` · `SUSPENDED` · `PASSWORD_CHANGED` · `REUSE` |
| `createdAt`                             | `TIMESTAMP(3)`                        |                                                                             |

- 인덱스: `RefreshToken_tokenHash_key`(unique), `RefreshToken_memberId_status_idx`(정지 · 재로그인 · 가족 상한 · 비밀번호 변경 · 모든 기기 로그아웃), `RefreshToken_familyId_status_idx`(가족 폐기, 유예 판정).
- refresh 회전 · 유예 · 재사용 탐지는 `SELECT ... FOR UPDATE` 한 트랜잭션에서 처리한다(SPEC-001 10절). 만료 · 회전된 행의 정리 배치는 결정 예정 (Step 8).

### enum

`Gender`(`MALE` · `FEMALE`), `MemberRole`(`MEMBER` · `ADMIN`), `AccountStatus`(`ACTIVE` · `SUSPENDED` · `WITHDRAWN`), `ClientType`(`WEB` · `ADMIN` — 앱용 값은 SPEC-005에서 추가), `RefreshTokenStatus`(`ACTIVE` · `ROTATED` · `REVOKED`), `RevokedReason`(위 표). Postgres enum 타입 이름도 같다.

### member_db에 없는 것 (설계로 뺀 것)

- `Credential`(인증 수단) 테이블 — 이메일+비밀번호 하나뿐이라 `Member.passwordHash`로 충분(D1). 카카오 · OTP 도입 시 분리 마이그레이션.
- 현장 본인 확인 기록 — event-service `CheckIn`(SPEC-005)이 소유(D2, ADR-004).
- `LoginAttempt` 이력 테이블 — 카운터 두 열과 로그로 충분. 잠금 시각 없음(D6).
- 약관 버전 · 동의 이력 테이블 — 약관이 실제로 개정될 때.
- 닉네임 · 매칭용 프로필 열 — 결정 예정 (Step 5 · 6).

## 6. event_db (Step 2, SPEC-002 9절)

원천: `apps/event-service/prisma/schema.prisma`, 마이그레이션 `prisma/migrations/20260923014911_init_event/migration.sql`. 설계 이유는 [SPEC-002 5 · 9절](../specs/SPEC-002-meetup-schedule.md#9-db-변경). 이번 Step의 event_db는 회원을 참조하지 않는다(작성자 열 · 개인정보 열 없음). 모든 시각은 `TIMESTAMPTZ(3)`이다 — SQL `now()`와 직접 비교하는 조건 때문이며 member_db의 `TIMESTAMP(3)`과 다르다(D7). seed는 없다(운영자가 화면에서 만든다).

| 마이그레이션                | 내용                                                                             |
| --------------------------- | -------------------------------------------------------------------------------- |
| `20260923014911_init_event` | enum `ScheduleStatus`, `Meetup`, `Schedule`, 인덱스, FK, 손으로 추가한 CHECK 6개 |

### `Meetup` — 모임 상품 (회차가 함께 쓰는 제목 · 설명)

| 열                        | 타입 · 제약                  | 뜻                                            |
| ------------------------- | ---------------------------- | --------------------------------------------- |
| `id`                      | `TEXT` PK, UUID v4           |                                               |
| `title`                   | `TEXT` NOT NULL              | 상품 제목                                     |
| `description`             | `TEXT` NOT NULL DEFAULT `''` | 상품 설명. 비어 있으면 `''`(null을 쓰지 않음) |
| `createdAt` · `updatedAt` | `TIMESTAMPTZ(3)`             | 생성 · 갱신 시각                              |

상태 · 삭제가 없다(SPEC-002 6절).

### `Schedule` — 회차 (참가자 화면: 일정)

| 열                                                               | 타입 · 제약                        | 뜻                                                                               |
| ---------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| `id`                                                             | `TEXT` PK, UUID v4                 | 랜덤이라 비공개 회차의 ID를 추측할 수 없다                                       |
| `meetupId`                                                       | `TEXT` FK → `Meetup.id` (RESTRICT) | 상품. 제목 · 설명은 복사하지 않고 응답을 만들 때 상품에서 읽는다                 |
| `startsAt` · `endsAt` · `applyDeadlineAt`                        | `TIMESTAMPTZ(3)` NOT NULL          | 시작 · 종료 · 신청 마감(필수)                                                    |
| `priceMale` · `priceFemale`                                      | `INTEGER` NOT NULL                 | 남녀 참가비. 같아도 달라도 된다                                                  |
| `capacityMale` · `capacityFemale`                                | `INTEGER` NOT NULL                 | 남녀 정원. 같아도 달라도 된다(차이는 화면 경고뿐)                                |
| `maleMinBirthYear` · `maleMaxBirthYear`                          | `INTEGER` nullable                 | 남성 연령대(출생연도 범위). null = 제한 없음. 여성은 연령 조건이 없어 열도 없다  |
| `venueArea`                                                      | `TEXT` NOT NULL                    | 지역 — 공개 화면의 유일한 장소 정보                                              |
| `venueName` · `venueAddress` · `venueDirections` · `venueMapUrl` | `TEXT` nullable                    | **운영자 전용**. 공개 응답에 싣지 않는다(SPEC-002 12절). null = 아직 정하지 않음 |
| `status`                                                         | `ScheduleStatus` DEFAULT `DRAFT`   | 회차 상태(SPEC-002 6절)                                                          |
| `cancelReason`                                                   | `TEXT` nullable                    | 취소 사유. CANCELLED일 때만 값이 있다                                            |
| `createdAt` · `updatedAt`                                        | `TIMESTAMPTZ(3)`                   | 생성 · 갱신 시각                                                                 |

- 인덱스: `Schedule_meetupId_startsAt_idx`(`meetupId`, `startsAt`) — 운영자 회차 목록과 FK 조회용(PostgreSQL은 FK 열에 인덱스를 자동으로 만들지 않는다). 공개 목록용 `(status, startsAt)` 인덱스는 두지 않는다 — 공개 목록 p95가 나빠지면 더한다. `Meetup`은 인덱스 없음.
- 유니크: 없다. 같은 상품 · 같은 시각의 회차를 DB에서 막지 않는다. 여러 회차 등록은 한 요청 안의 `(startsAt, venueArea)` 중복만 요청 검사로 막는다(D15).
- CHECK(마이그레이션 SQL에만 있음 — drift로 잡히지 않는다. 테스트: `apps/event-service/src/prisma/schedule-checks.integration.spec.ts`):

| 제약                             | 조건                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `Schedule_price_valid`           | `priceMale >= 0 AND priceFemale >= 0`. 상한(1,000,000)은 요청 스키마에만 있다              |
| `Schedule_capacity_valid`        | `capacityMale` · `capacityFemale` 각각 1~50                                                |
| `Schedule_time_order`            | `applyDeadlineAt <= startsAt AND startsAt < endsAt`                                        |
| `Schedule_male_birth_year_valid` | 두 출생연도 각각 null이거나 1900 이상, 둘 다 있으면 `maleMinBirthYear <= maleMaxBirthYear` |
| `Schedule_venue_map_url_https`   | `venueMapUrl IS NULL OR venueMapUrl LIKE 'https://%'`                                      |
| `Schedule_cancel_reason`         | `(status = 'CANCELLED') = (cancelReason IS NOT NULL)` — CANCELLED일 때만, 그리고 반드시    |

### enum

`ScheduleStatus`(`DRAFT` · `OPEN` · `CLOSED` · `CANCELLED`). 행사를 마친 상태는 Step 5(SPEC-005)가 더한다. Postgres enum 타입 이름도 같다.

### event_db에 없는 것 (설계로 뺀 것)

- 작성자 · 수정자 열 — 로그(`adminId`)가 원천이다(SPEC-002 5절).
- 여성 연령대 열 — 여성에게는 연령 조건이 없다(D5).
- NEXT 재참가 혜택 · "같은 금액" 여부 — 혜택 내용은 결정 예정 (Step 3 · 4), 같은 금액 여부는 두 값의 비교로 안다(D3).
- 신청(`Application`) · 좌석 계산 — Step 3이 같은 `event_db`에 더한다. 방식은 결정 예정 (Step 3)(SPEC-002 9절).
