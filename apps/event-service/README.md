# @oneul-sai/event-service

오늘사이 오프라인 소개팅 운영 도메인 서비스. (포트 4002)

## 책임

오프라인 소개팅 운영 핵심을 담당한다:

- Meetup
- Schedule
- Application
- Participant
- Check-in
- Rotation

위 항목은 모두 내부 도메인이며, 별도 서비스로 분리하지 않는다.

> 지금은 Step 2([SPEC-002](../../docs/specs/SPEC-002-meetup-schedule.md))의 DB 스키마(`Meetup` · `Schedule`)와 테스트 전용 DB까지 있다.
> 상품 · 회차 API는 다음 PR(SPEC-002 15절 5번)에서 추가한다.

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

3. 개발 서버를 실행한다:

   ```bash
   pnpm --filter @oneul-sai/event-service dev
   ```

## 환경 변수

`.env.example`을 복사해 `.env`를 만든다.

| 변수                | 기본값                                                  | 설명                                                                                                           |
| ------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `PORT`              | `4002`                                                  | HTTP 서버 포트                                                                                                 |
| `DATABASE_URL`      | `postgresql://oneul:oneul@localhost:5432/event_db`      | event_db Postgres 연결 URL                                                                                     |
| `TEST_DATABASE_URL` | `postgresql://oneul:oneul@localhost:5432/event_test_db` | 통합 테스트 전용 DB. vitest `globalSetup`만 읽는다(서비스 부팅에는 쓰지 않음). 이름이 `_test_db`로 끝나야 한다 |

## 마이그레이션

`event_db`의 스키마는 `prisma/schema.prisma`, 마이그레이션은 `prisma/migrations/`(첫 마이그레이션 `init_event` — CHECK 제약은 SQL에만 있다). 테이블 · CHECK 목록은 [docs/database/README.md](../../docs/database/README.md) 6절.

## 테스트

```bash
pnpm --filter @oneul-sai/event-service test               # 단위 — .env 없이 돈다
pnpm --filter @oneul-sai/event-service test:integration   # 통합 — event_test_db
```

- 통합 테스트는 개발 DB `event_db`가 아니라 **테스트 전용 DB `event_test_db`**(`TEST_DATABASE_URL`)에서 돈다(SPEC-002 9절, D13). `.env`의 `DATABASE_URL`은 보지 않는다.
- `globalSetup`(`src/testing/integration.global-setup.ts`)이 실행마다 한 번 이름 검사(`_test_db`로 끝나지 않으면 즉시 실패) → `prisma migrate deploy`(적용 안 된 마이그레이션만. DB가 없으면 Prisma가 만든다) → URL을 워커에 `provide`한다.
- 각 테스트는 앞에서 `resetTestDatabase`로 `Schedule` · `Meetup`을 비운다. 비우기 직전에 `current_database()`가 `_test_db`로 끝나는지 다시 확인한다.
- 이미 적용한 마이그레이션 파일을 고쳐 `migrate deploy`가 checksum 불일치로 실패하면 테스트 DB를 지우고 다시 실행한다(테스트 데이터뿐이다). `migrate reset`은 쓰지 않는다.

  ```bash
  docker compose exec postgres psql -U oneul -d oneul -c "DROP DATABASE event_test_db;"
  ```

## Swagger

- http://localhost:4002/docs

## Health

- `GET http://localhost:4002/health`
- 응답: `{ status: 'ok' | 'degraded', service, database: 'up' | 'down', timestamp }`
