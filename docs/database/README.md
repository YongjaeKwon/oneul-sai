# Database

## 1. Database per Service

각 서비스는 자신의 논리 Database만 소유한다. 다른 서비스의 DB에 직접 접근(쿼리, FK 참조 포함)하는 것은 금지이며, 다른 서비스의 데이터가 필요하면 REST 호출 또는 Kafka 이벤트로만 얻는다. 개발 환경에서는 PostgreSQL 인스턴스 하나를 공유하되 논리 DB로 소유권을 분리한다. (ADR-007 참고)

| 서비스 | 논리 DB | 기본 URL |
| --- | --- | --- |
| member-service | `member_db` | `postgresql://oneul:oneul@localhost:5432/member_db` |
| event-service | `event_db` | `postgresql://oneul:oneul@localhost:5432/event_db` |
| matching-service | `matching_db` | `postgresql://oneul:oneul@localhost:5432/matching_db` |
| notification-service | `notification_db` | `postgresql://oneul:oneul@localhost:5432/notification_db` |
| payment-service | `payment_db` | `postgresql://oneul:oneul@localhost:5432/payment_db` |

- 실제 접속 URL은 각 서비스 디렉토리의 `.env`(`DATABASE_URL` 계열 변수)로 주입한다. 루트 `.env.example` 참고.

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

- 스키마 위치: `apps/<service>/prisma/schema.prisma`
- 설정: `apps/<service>/prisma.config.ts` — Prisma 7은 `.env`를 자동 로드하지 않으므로, 이 파일에서 `dotenv`로 해당 서비스의 `.env`를 로드한다.
- 클라이언트 생성:

  ```bash
  pnpm --filter member-service db:generate
  # 전체 서비스 일괄 생성
  pnpm db:generate
  ```

- 생성된 클라이언트는 `apps/<service>/src/generated/prisma/`에 출력되며 **gitignore 대상**이다. clone 직후에는 `db:generate`를 먼저 실행해야 타입체크/빌드가 통과한다(turbo가 `build`/`dev`/`typecheck` 전에 `db:generate`를 실행하도록 이미 연결돼 있다).
- 런타임 연결은 `@prisma/adapter-pg`(driver adapter)를 사용한다.

## 4. 마이그레이션

- 마이그레이션(`prisma migrate dev`)은 **실제 도메인 모델을 추가하는 단계**에서 시작한다.
- 현재 스키마는 클라이언트 생성 확인용 최소 상태이며, 마이그레이션 파일은 아직 만들지 않는다.
- 마이그레이션 시작 이후에는 스키마 변경 → migrate → generate 순서를 규칙으로 삼는다.
