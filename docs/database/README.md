# 데이터베이스

DB 소유권, Prisma 7 워크플로우, 마이그레이션 규칙, 그리고 실제로 있는 테이블의 인덱스다. 스키마의 원천은 `apps/<service>/prisma/schema.prisma`이고, 이 문서와 다르면 스키마가 맞다.

- 상태: 확정
- 최종 갱신: 2026-09-23 (Step 1 — member_db 첫 마이그레이션 `init_member`, 워크플로우 · seed 규칙)

## 1. Database per Service

각 서비스는 자신의 논리 Database만 소유한다. 다른 서비스의 DB에 직접 접근(쿼리, FK 참조 포함)하는 것은 금지이며, 다른 서비스의 데이터가 필요하면 REST 호출 또는 Kafka 이벤트로만 얻는다. 개발 환경에서는 PostgreSQL 인스턴스 하나를 공유하되 논리 DB로 소유권을 분리한다. (ADR-007 참고)

| 서비스               | 논리 DB           | 기본 URL                                                  | 상태                                    |
| -------------------- | ----------------- | --------------------------------------------------------- | --------------------------------------- |
| member-service       | `member_db`       | `postgresql://oneul:oneul@localhost:5432/member_db`       | Step 1 — `Member` · `RefreshToken`(5절) |
| event-service        | `event_db`        | `postgresql://oneul:oneul@localhost:5432/event_db`        | 최소 스키마(모델 없음). Step 2          |
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

마이그레이션은 **실제 도메인 모델을 추가하는 Step**에서 그 서비스에 시작한다. 첫 사례는 Step 1의 member-service `20260922074759_init_member`(5절)다. 나머지 서비스는 클라이언트 생성 확인용 최소 스키마이며 마이그레이션 파일이 없다 — 각 Step의 설계서 "9. DB 변경" 절과 함께 시작한다.

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
- 통합 테스트(`*.integration.spec.ts`, `pnpm --filter @oneul-sai/member-service test:integration`)는 `DATABASE_URL`의 실제 Postgres에 `migrate deploy`가 적용돼 있어야 한다. CI는 `integration` 잡의 `postgres:17` service container에 `migrate deploy` → `test:integration` 순서로 돈다(`.github/workflows/ci.yml`). 통합 테스트는 각 테스트 앞에서 테이블을 비우므로 **로컬 개발 DB에서 돌리면 회원 데이터가 지워진다** — 실행 뒤 seed를 다시 한다.

### 4.3 seed

- ADMIN(운영자) 계정은 가입 API로 만들 수 없고 seed로만 만든다: `pnpm --filter @oneul-sai/member-service build && pnpm --filter @oneul-sai/member-service db:seed`(`node dist/seed/seed-admin.js`, `prisma.config.ts`의 `migrations.seed`도 같은 명령).
- 입력은 env `SEED_ADMIN_EMAIL` · `SEED_ADMIN_NAME`, 비밀번호는 `SEED_ADMIN_PASSWORD_FILE`(파일) > `SEED_ADMIN_PASSWORD`(로컬 전용) > stdin. upsert가 아니라 분기한다(없으면 생성 / ADMIN이 있으면 `SEED_ADMIN_RESET_PASSWORD=true`일 때만 비밀번호 갱신 + 그 계정의 세션 전부 폐기 / MEMBER가 같은 이메일이면 실패). 상세는 [apps/member-service/README.md](../../apps/member-service/README.md) "seed" 절.
- 시드 데이터는 운영자 계정뿐이다. 테스트용 회원 데이터 seed는 두지 않는다(통합 테스트가 자기 데이터를 만든다).

### 4.4 로컬 처음 세팅 순서

```bash
docker compose up -d
cp apps/member-service/.env.example apps/member-service/.env
pnpm --filter @oneul-sai/member-service exec prisma migrate dev   # 커밋된 마이그레이션 적용
pnpm db:generate
pnpm --filter @oneul-sai/member-service build && pnpm --filter @oneul-sai/member-service db:seed
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
