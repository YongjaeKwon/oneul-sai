# @oneul-sai/notification-service

오늘사이 알림 도메인 서비스. (포트 4004)

## 책임

- Push
- SMS
- Email
- 알림 발송 이력

다른 서비스가 이 서비스의 내부 DB에 직접 접근하는 것을 금지한다.
알림 장애가 핵심 트랜잭션을 실패시키지 않도록 비동기 처리한다 (향후).

> 현재는 환경 구성 단계로 health 엔드포인트와 Prisma 연결 구조만 존재한다.
> Push/SMS/Email 발송 등 비즈니스 기능은 기능 구현 단계에서 추가한다.

## 실행 방법

1. 데이터베이스를 먼저 띄운다 (모노레포 루트에서):

   ```bash
   docker compose up -d
   ```

2. Prisma 클라이언트를 생성한다:

   ```bash
   pnpm --filter @oneul-sai/notification-service db:generate
   ```

3. 개발 서버를 실행한다:

   ```bash
   pnpm --filter @oneul-sai/notification-service dev
   ```

## 환경 변수

`.env.example`을 복사해 `.env`를 만든다.

| 변수           | 기본값                                                    | 설명                              |
| -------------- | --------------------------------------------------------- | --------------------------------- |
| `PORT`         | `4004`                                                    | HTTP 서버 포트                    |
| `DATABASE_URL` | `postgresql://oneul:oneul@localhost:5432/notification_db` | notification_db Postgres 연결 URL |

## Swagger

- http://localhost:4004/docs

## Health

- `GET http://localhost:4004/health`
- 응답: `{ status: 'ok' | 'degraded', service, database: 'up' | 'down', timestamp }`
