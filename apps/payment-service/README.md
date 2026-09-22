# @oneul-sai/payment-service

오늘사이 결제 도메인 서비스. (포트 4005)

## 책임

- 결제 요청/승인/검증/취소
- Webhook
- 결제 상태

PG Provider 종속 코드는 이 서비스 내부에 격리하며 외부로 노출하지 않는다. 결제 이벤트 발행 예정 (향후).

> 현재는 환경 구성 단계로 health 엔드포인트와 Prisma 연결 구조만 존재한다.
> 결제 승인/취소/Webhook 처리 등 비즈니스 기능은 기능 구현 단계에서 추가한다.

## 실행 방법

1. 데이터베이스를 먼저 띄운다 (모노레포 루트에서):

   ```bash
   docker compose up -d
   ```

2. Prisma 클라이언트를 생성한다:

   ```bash
   pnpm --filter @oneul-sai/payment-service db:generate
   ```

3. 개발 서버를 실행한다:

   ```bash
   pnpm --filter @oneul-sai/payment-service dev
   ```

## 환경 변수

`.env.example`을 복사해 `.env`를 만든다.

| 변수           | 기본값                                                 | 설명                         |
| -------------- | ------------------------------------------------------ | ---------------------------- |
| `PORT`         | `4005`                                                 | HTTP 서버 포트               |
| `DATABASE_URL` | `postgresql://oneul:oneul@localhost:5432/payment_db` | payment_db Postgres 연결 URL |

## Swagger

- http://localhost:4005/docs

## Health

- `GET http://localhost:4005/health`
- 응답: `{ status: 'ok' | 'degraded', service, database: 'up' | 'down', timestamp }`
