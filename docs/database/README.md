# 데이터베이스

DB 소유권, Prisma 7 워크플로우, 마이그레이션 규칙, 그리고 실제로 있는 테이블의 인덱스다. 스키마의 원천은 `apps/<service>/prisma/schema.prisma`이고, 이 문서와 다르면 스키마가 맞다.

- 상태: 확정
- 최종 갱신: 2026-10-27 (SPEC-002 개정 2번 PR — event_db 마이그레이션 `add_schedule_condition_columns`(`Schedule` nullable 열 다섯 · CHECK `Schedule_female_birth_year_valid` · `Schedule_min_per_gender_valid`). 그 전: 2026-10-15 SPEC-003 개정 · SPEC-004 4번 PR — event_db 마이그레이션 `add_application_statuses`(`ApplicationStatus`에 `CONFIRMED` · `APPLIED`, 기본값 `APPLIED`), 활성 · 자리 잡은 집합 둘, 점검 쿼리 조건, 되살리기 절차에 "되살릴 상태". 그 전: 2026-10-01 SPEC-004 확정 — NEXT 재참가 혜택의 결정 예정 시점. 그 전: 2026-09-25 Step 3 — event_db `Application`(마이그레이션 `add_application`), 부분 유니크 인덱스, 점검 쿼리 · 되살리기 절차. 그 전: 2026-09-24 SPEC-003 확정 — NEXT 재참가 혜택의 결정 예정 시점. 그 전: 2026-09-23 Step 2 — event_db 첫 마이그레이션 `init_event`, 테스트 전용 DB `event_test_db`. seed 전 빌드를 `turbo run build`로)

## 1. Database per Service

각 서비스는 자신의 논리 Database만 소유한다. 다른 서비스의 DB에 직접 접근(쿼리, FK 참조 포함)하는 것은 금지이며, 다른 서비스의 데이터가 필요하면 REST 호출 또는 Kafka 이벤트로만 얻는다. 개발 환경에서는 PostgreSQL 인스턴스 하나를 공유하되 논리 DB로 소유권을 분리한다. (ADR-007 참고)

| 서비스               | 논리 DB           | 기본 URL                                                  | 상태                                                    |
| -------------------- | ----------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| member-service       | `member_db`       | `postgresql://oneul:oneul@localhost:5432/member_db`       | Step 1 — `Member` · `RefreshToken`(5절)                 |
| event-service        | `event_db`        | `postgresql://oneul:oneul@localhost:5432/event_db`        | Step 2 · 3 — `Meetup` · `Schedule` · `Application`(6절) |
| matching-service     | `matching_db`     | `postgresql://oneul:oneul@localhost:5432/matching_db`     | 최소 스키마(모델 없음). Step 6                          |
| notification-service | `notification_db` | `postgresql://oneul:oneul@localhost:5432/notification_db` | 최소 스키마(모델 없음). Step 7                          |
| payment-service      | `payment_db`      | `postgresql://oneul:oneul@localhost:5432/payment_db`      | 최소 스키마(모델 없음). Step 4                          |

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
- 워커는 `inject('testDatabaseUrl')`로 받은 URL로만 `PrismaService`를 만든다. 각 테스트 앞의 `resetTestDatabase`는 `SELECT current_database()`가 `_test_db`로 끝나는지 확인한 뒤에만 `TRUNCATE "Application", "Schedule", "Meetup"`을 한다.
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

## 6. event_db (Step 2 · 3 · 4, SPEC-002 · SPEC-003 · SPEC-004 9절)

원천: `apps/event-service/prisma/schema.prisma`, 마이그레이션 `prisma/migrations/*/migration.sql`. 설계 이유는 [SPEC-002 5 · 9절](../specs/SPEC-002-meetup-schedule.md#9-db-변경) · [SPEC-003 5 · 9절](../specs/SPEC-003-application.md#9-db-변경) · [SPEC-004 9절](../specs/SPEC-004-payment.md#9-db-변경). Step 3부터 event_db가 회원과 이어진 값을 가진다 — `Application.memberId`(member_db 회원 ID, FK 없음)와 신청할 때의 성별이다. 이름 · 휴대폰 · 출생연도는 저장하지 않는다(SPEC-003 D1 · 12절). 모든 시각은 `TIMESTAMPTZ(3)`이다 — SQL `now()`와 직접 비교하는 조건 때문이며 member_db의 `TIMESTAMP(3)`과 다르다(D7). seed는 없다(운영자가 화면에서 만든다).

| 마이그레이션                                    | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260923014911_init_event`                     | enum `ScheduleStatus`, `Meetup`, `Schedule`, 인덱스, FK, 손으로 추가한 CHECK 6개                                                                                                                                                                                                                                                                                                                                                             |
| `20260925001239_add_application`                | enum `Gender` · `ApplicationStatus` · `ApplicationCancelledBy`, `Application`, 인덱스 둘 + 부분 유니크 인덱스, FK, 손으로 추가한 CHECK 2개                                                                                                                                                                                                                                                                                                   |
| `20261015030000_add_application_statuses`       | `ApplicationStatus`에 `CONFIRMED` · `APPLIED`를 `ADD VALUE`(이 순서 — 끝에 붙는다, 되돌릴 수 없다), `Application.status` 기본값 `APPLIED`(SPEC-003 D14 · D19, SPEC-004 9절). 손으로 썼다 — Prisma는 마이그레이션 파일을 트랜잭션으로 감싸지 않고 문장을 하나씩 실행해 새 값을 쓰는 `SET DEFAULT`가 같은 파일에 있다(SPEC-003 17절 "개정 기록"). psql로 손수 적용할 때 `BEGIN … COMMIT`으로 감싸면 55P04 "unsafe use of new value"로 실패한다 |
| `20261027063854_add_schedule_condition_columns` | `Schedule`에 nullable 열 다섯(`femaleMinBirthYear` · `femaleMaxBirthYear` · `participantCondition` · `priceNote` · `minPerGender` — DB 기본값 없음, 기존 행은 NULL로 남아 옮길 데이터가 없다)과 손으로 추가한 CHECK 2개(SPEC-002 개정 D16 · D17 · 9절). enum을 건드리지 않아 `add_application_statuses`와 독립이다                                                                                                                           |

### `Meetup` — 모임 상품 (회차가 함께 쓰는 제목 · 설명)

| 열                        | 타입 · 제약                  | 뜻                                            |
| ------------------------- | ---------------------------- | --------------------------------------------- |
| `id`                      | `TEXT` PK, UUID v4           |                                               |
| `title`                   | `TEXT` NOT NULL              | 상품 제목                                     |
| `description`             | `TEXT` NOT NULL DEFAULT `''` | 상품 설명. 비어 있으면 `''`(null을 쓰지 않음) |
| `createdAt` · `updatedAt` | `TIMESTAMPTZ(3)`             | 생성 · 갱신 시각                              |

상태 · 삭제가 없다(SPEC-002 6절).

### `Schedule` — 회차 (참가자 화면: 일정)

| 열                                                               | 타입 · 제약                        | 뜻                                                                                                                                                 |
| ---------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                             | `TEXT` PK, UUID v4                 | 랜덤이라 비공개 회차의 ID를 추측할 수 없다                                                                                                         |
| `meetupId`                                                       | `TEXT` FK → `Meetup.id` (RESTRICT) | 상품. 제목 · 설명은 복사하지 않고 응답을 만들 때 상품에서 읽는다                                                                                   |
| `startsAt` · `endsAt` · `applyDeadlineAt`                        | `TIMESTAMPTZ(3)` NOT NULL          | 시작 · 종료 · 신청 마감(필수)                                                                                                                      |
| `priceMale` · `priceFemale`                                      | `INTEGER` NOT NULL                 | 남녀 참가비. 같아도 달라도 된다                                                                                                                    |
| `priceNote`                                                      | `TEXT` nullable                    | 참가비 보조 문구(예 "커피 1잔 포함"). 공개 응답에 싣는 표시 값. 상한 50자는 요청 스키마에만 있다(SPEC-002 D17)                                     |
| `capacityMale` · `capacityFemale`                                | `INTEGER` NOT NULL                 | 남녀 정원. 같아도 달라도 된다(차이는 화면 경고뿐)                                                                                                  |
| `minPerGender`                                                   | `INTEGER` nullable                 | 성별 최소 인원. **운영자 응답에만** 싣는 표시 값 — 서버 판정 · 자동 취소 없음, 정원과의 관계도 보지 않는다. DB 기본값 없음(화면이 5로 채운다, D17) |
| `maleMinBirthYear` · `maleMaxBirthYear`                          | `INTEGER` nullable                 | 남성 연령대(출생연도 범위). null = 그 성별 제한 없음(SPEC-002 D16)                                                                                 |
| `femaleMinBirthYear` · `femaleMaxBirthYear`                      | `INTEGER` nullable                 | 여성 연령대 — 남성 두 열과 같은 규칙. null = 그 성별 제한 없음(D16, 개정 2026-10-14)                                                               |
| `participantCondition`                                           | `TEXT` nullable                    | 참가 조건 문구(예 "90년대생 직장인"). 공개 응답에 싣는 표시 값 — 판정 없음. 상한 100자는 요청 스키마에만 있다(D17)                                 |
| `venueArea`                                                      | `TEXT` NOT NULL                    | 지역 — 공개 화면의 유일한 장소 정보                                                                                                                |
| `venueName` · `venueAddress` · `venueDirections` · `venueMapUrl` | `TEXT` nullable                    | **운영자 전용**. 공개 응답에 싣지 않는다(SPEC-002 12절). null = 아직 정하지 않음                                                                   |
| `status`                                                         | `ScheduleStatus` DEFAULT `DRAFT`   | 회차 상태(SPEC-002 6절)                                                                                                                            |
| `cancelReason`                                                   | `TEXT` nullable                    | 취소 사유. CANCELLED일 때만 값이 있다                                                                                                              |
| `createdAt` · `updatedAt`                                        | `TIMESTAMPTZ(3)`                   | 생성 · 갱신 시각                                                                                                                                   |

- 인덱스: `Schedule_meetupId_startsAt_idx`(`meetupId`, `startsAt`) — 운영자 회차 목록과 FK 조회용(PostgreSQL은 FK 열에 인덱스를 자동으로 만들지 않는다). 공개 목록용 `(status, startsAt)` 인덱스는 두지 않는다 — 공개 목록 p95가 나빠지면 더한다. `Meetup`은 인덱스 없음.
- 유니크: 없다. 같은 상품 · 같은 시각의 회차를 DB에서 막지 않는다. 여러 회차 등록은 한 요청 안의 `(startsAt, venueArea)` 중복만 요청 검사로 막는다(D15).
- CHECK(마이그레이션 SQL에만 있음 — drift로 잡히지 않는다. 테스트: `apps/event-service/src/prisma/schedule-checks.integration.spec.ts`):

| 제약                               | 조건                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Schedule_price_valid`             | `priceMale >= 0 AND priceFemale >= 0`. 상한(1,000,000)은 요청 스키마에만 있다                                                                       |
| `Schedule_capacity_valid`          | `capacityMale` · `capacityFemale` 각각 1~50                                                                                                         |
| `Schedule_time_order`              | `applyDeadlineAt <= startsAt AND startsAt < endsAt`                                                                                                 |
| `Schedule_male_birth_year_valid`   | 두 출생연도 각각 null이거나 1900 이상, 둘 다 있으면 `maleMinBirthYear <= maleMaxBirthYear`                                                          |
| `Schedule_female_birth_year_valid` | 남성과 같은 모양 — 두 출생연도 각각 null이거나 1900 이상, 둘 다 있으면 `femaleMinBirthYear <= femaleMaxBirthYear`(`add_schedule_condition_columns`) |
| `Schedule_min_per_gender_valid`    | `minPerGender IS NULL OR minPerGender BETWEEN 1 AND 50`. 정원과의 관계는 보지 않는다(`add_schedule_condition_columns`)                              |
| `Schedule_venue_map_url_https`     | `venueMapUrl IS NULL OR venueMapUrl LIKE 'https://%'`                                                                                               |
| `Schedule_cancel_reason`           | `(status = 'CANCELLED') = (cancelReason IS NOT NULL)` — CANCELLED일 때만, 그리고 반드시                                                             |

### `Application` — 참가 신청 (SPEC-003)

| 열                        | 타입 · 제약                           | 뜻                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                      | `TEXT` PK, UUID v4                    |                                                                                                                                                                                                                                                                                           |
| `scheduleId`              | `TEXT` FK → `Schedule.id` (RESTRICT)  | 신청한 회차                                                                                                                                                                                                                                                                               |
| `memberId`                | `TEXT` NOT NULL                       | member_db의 회원 ID. FK 없음(ADR-007)                                                                                                                                                                                                                                                     |
| `gender`                  | `Gender` NOT NULL                     | 신청할 때의 성별 스냅샷. 자리 계산에 쓴다                                                                                                                                                                                                                                                 |
| `price`                   | `INTEGER` NOT NULL                    | 신청할 때 그 성별의 참가비. 운영자가 회차 참가비를 바꿔도 그대로다                                                                                                                                                                                                                        |
| `status`                  | `ApplicationStatus` DEFAULT `APPLIED` | 신청 상태(SPEC-003 6절). 접수 `APPLIED`로 태어나 운영자 참가 가능 안내 때 `PENDING`(입금 대기), 입금 확인 뒤 `CONFIRMED`(SPEC-004). 집합 둘(D14): **활성** = `CANCELLED`가 아닌 신청(접수 포함 — 부분 유니크 · 중복 방지 · 연쇄 취소), **자리 잡은** = `PENDING` · `CONFIRMED`(정원 집계) |
| `cancelledBy`             | `ApplicationCancelledBy` nullable     | 취소 주체. CANCELLED일 때만 값이 있다                                                                                                                                                                                                                                                     |
| `createdAt` · `updatedAt` | `TIMESTAMPTZ(3)`                      | 신청 · 갱신 시각. 취소된 행은 다시 바뀌지 않아 `updatedAt`이 취소 시각이다(D1)                                                                                                                                                                                                            |

- 인덱스: `Application_scheduleId_createdAt_idx`(운영자 목록 · 성별 집계 · FK 조회), `Application_memberId_createdAt_idx`(내 신청 목록 · 입금 대기 한도).
- **부분 유니크 인덱스** `Application_active_member_key`: `("scheduleId", "memberId") WHERE "status" <> 'CANCELLED'` — 한 회차 · 한 회원의 활성 신청은 하나다(최종 방어선, D3). CANCELLED 행은 같은 쌍에 여러 개 있을 수 있다. Prisma `partialIndexes` 미리보기로 스키마에 선언해 Prisma가 만들고 관리한다(개발 승인 N).
- **생성 선택자 `scheduleId_memberId`를 쓰지 않는다.** 미리보기의 생성 클라이언트는 이 인덱스를 보통 복합 유니크처럼 다뤄 `findUnique` · `update` · `upsert` 등에 `scheduleId_memberId`를 만든다. 같은 쌍에 CANCELLED 행이 여럿일 수 있어 취소된 행을 가리킬 수 있다. 활성 신청은 `findFirst({ where: { scheduleId, memberId, ...ACTIVE_APPLICATION_WHERE } })`로만 찾는다([기술 스택 함정 11](../architecture/tech-stack.md)).
- 유니크 · CHECK · FK 테스트: `apps/event-service/src/prisma/application-checks.integration.spec.ts`.

| 제약                       | 조건                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `Application_price_valid`  | `price >= 0`                                                                           |
| `Application_cancelled_by` | `(status = 'CANCELLED') = (cancelledBy IS NOT NULL)` — CANCELLED일 때만, 그리고 반드시 |

#### 불변식 점검 쿼리 — "자리 잡은 신청 수 ≤ 정원"

여러 행에 걸친 조건이라 CHECK로 쓸 수 없다. 자리를 잡는 모든 쓰기(참가 가능 안내 `UPDATE`, 아래 되살리기)와 정원 수정이 회차 행을 먼저 잠그는 것으로 지킨다(SPEC-003 D3 · D8 · D16). 접수(`APPLIED`)는 자리를 잡지 않으므로 세지 않는다(D14). 운영 중 확인할 때 이 쿼리를 돌린다. **결과는 항상 0행이어야 한다.**

```sql
SELECT s."id", a."gender", count(*) AS seated,
       CASE a."gender" WHEN 'MALE' THEN s."capacityMale" ELSE s."capacityFemale" END AS capacity
FROM "Application" a JOIN "Schedule" s ON s."id" = a."scheduleId"
WHERE a."status" IN ('PENDING', 'CONFIRMED')
GROUP BY s."id", a."gender", s."capacityMale", s."capacityFemale"
HAVING count(*) > CASE a."gender" WHEN 'MALE' THEN s."capacityMale" ELSE s."capacityFemale" END;
```

#### 잘못 취소한 신청 되살리기 (SPEC-003 J-2 — 화면 없음)

운영자 요청을 받아 개발자가 DB에서 한다. 운영자는 요청에 **되살릴 상태**(접수 `APPLIED` 또는 입금 대기 `PENDING`)를 적는다 — 취소 전 상태는 기록에 없다(SPEC-003 6절). 한 트랜잭션에서 회차 행을 먼저 잠그고, 아래를 확인한 뒤에만 되살린다. psql 변수로 값을 넘긴다: `docker compose exec postgres psql -U oneul -d event_db -v scheduleId=<회차 ID> -v applicationId=<신청 ID> -v status=<APPLIED 또는 PENDING>`(저장소 루트에서). 결제 기록이 있는 신청의 "참가 확정으로 되살리기" 분기는 SPEC-004 D6(6b PR에서 이 절에 더한다).

```sql
BEGIN;
SET LOCAL lock_timeout = '2s';
SELECT "id", "status", "startsAt", "capacityMale", "capacityFemale"
FROM "Schedule" WHERE "id" = :'scheduleId' FOR UPDATE;
-- 1 · 2 · 3을 확인한다(아래)
UPDATE "Application"
SET "status" = :'status'::"ApplicationStatus", "cancelledBy" = NULL, "updatedAt" = now()
WHERE "id" = :'applicationId' AND "scheduleId" = :'scheduleId' AND "status" = 'CANCELLED';
COMMIT; -- 하나라도 어긋나면 ROLLBACK
```

1. 회차가 OPEN 또는 CLOSED이고 아직 시작 전이다(`"startsAt" > now()`). 취소된 회차 · 지난 회차에는 되살리지 않는다.
2. **입금 대기로 되살릴 때만**: 그 신청 성별의 자리 잡은 신청 수(`PENDING` · `CONFIRMED`)가 정원보다 작다 — 불변식이라 운영자도 넘길 수 없다. 접수로 되살릴 때는 보지 않는다(자리를 잡지 않는다).
3. **입금 대기로 되살릴 때만**: 같은 회원의 입금 대기 신청이 다른 시작 전 회차에 없다(입금 대기 한도). **이것만 예외다** — 어긋나면 먼저 운영자에게 알리고, 운영자가 한도를 넘겨도 된다고 명시했을 때만 진행한다.

1 · 2가 어긋나거나 3이 어긋나고 명시가 없으면 ROLLBACK하고 운영자에게 알린다. 같은 회원의 활성 신청(접수 포함)이 이 회차에 이미 있으면 부분 유니크 인덱스가 막는다(23505). 신청 마감 · 연령대는 다시 보지 않는다(운영자 판단).

### enum

`ScheduleStatus`(`DRAFT` · `OPEN` · `CLOSED` · `CANCELLED`). 행사를 마친 상태는 Step 5(SPEC-005)가 더한다. `Gender`(`MALE` · `FEMALE`) — member_db의 `Gender`와 값이 같다. `ApplicationStatus`(`PENDING` · `CANCELLED` · `CONFIRMED` · `APPLIED` — **이 순서**. `ADD VALUE`는 끝에 붙으므로 뜻의 순서(접수 → 입금 대기 → 참가 확정)와 다르다. `schema.prisma` · contracts `APPLICATION_STATUSES`도 같은 순서라 `prisma migrate diff`가 비어 있다). `ApplicationCancelledBy`(`MEMBER` · `ADMIN` · `SCHEDULE`). Postgres enum 타입 이름도 같다.

### event_db에 없는 것 (설계로 뺀 것)

- 작성자 · 수정자 열 — 로그(`adminId`)가 원천이다(SPEC-002 5절).
- 환불 규정 열 — 회차마다 다르지 않아 contracts 상수 `REFUND_POLICY`로 두고 화면이 보여 준다(SPEC-002 D18). 여성 연령대 열은 개정으로 생겼다(D16 — D5의 "여성 열 없음"을 대체).
- 최소 인원 판정 · 자동 취소 상태 — `minPerGender`는 표시 값이고, 미달 판단과 회차 취소는 운영자가 한다(SPEC-002 D17).
- NEXT 재참가 혜택 · "같은 금액" 여부 — 혜택 내용은 결정 예정 (Step 6) — Step 3 신청에는 없음. 같은 금액 여부는 두 값의 비교로 안다(D3).
- 신청자의 이름 · 휴대폰 · 출생연도 — member_db에만 있다. 운영자 화면이 member API로 붙인다(SPEC-003 D11).
- 대기자 명단 · 취소 사유 · 취소 시각 열 — 대기자와 취소 사유는 없고(SPEC-003 확인 요청 E · J), 취소 시각은 `updatedAt`이다. 취소된 행을 고치는 Step이 생기면 `cancelledAt`을 먼저 더한다(SPEC-003 9절 "Step 4가 더할 것").
- 좌석 수 열 — 성별 자리 잡은 신청 수(`PENDING` · `CONFIRMED`)를 그때그때 센다(회차 행 잠금 뒤).
- 참가 가능 안내 시각 열 — 안내는 로그 `application.invited`에 남고 입금 대기 행의 `updatedAt`이 곧 안내 시각이다(SPEC-003 D14).
