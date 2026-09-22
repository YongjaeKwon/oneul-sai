# @oneul-sai/matching-service

오늘사이 매칭 도메인 서비스. (포트 4003)

## 책임

- 호감 선택
- Preference
- 상호 선택 판별
- Match 생성
- Match 결과

매칭 생성 후 다른 작업을 직접 처리하지 않고 Kafka Event를 발행한다 (후속 작업 위임 — 향후).

> 현재는 환경 구성 단계로 health 엔드포인트와 Prisma 연결 구조만 존재한다.
> 호감 선택/매칭 판별 등 비즈니스 기능은 기능 구현 단계에서 추가한다.

## 실행 방법

1. 데이터베이스를 먼저 띄운다 (모노레포 루트에서):

   ```bash
   docker compose up -d
   ```

2. Prisma 클라이언트를 생성한다:

   ```bash
   pnpm --filter @oneul-sai/matching-service db:generate
   ```

3. 개발 서버를 실행한다:

   ```bash
   pnpm --filter @oneul-sai/matching-service dev
   ```

## 환경 변수

`.env.example`을 복사해 `.env`를 만든다.

| 변수           | 기본값                                                  | 설명                          |
| -------------- | ------------------------------------------------------- | ----------------------------- |
| `PORT`         | `4003`                                                  | HTTP 서버 포트                |
| `DATABASE_URL` | `postgresql://oneul:oneul@localhost:5432/matching_db` | matching_db Postgres 연결 URL |

## Swagger

- http://localhost:4003/docs

## Health

- `GET http://localhost:4003/health`
- 응답: `{ status: 'ok' | 'degraded', service, database: 'up' | 'down', timestamp }`
