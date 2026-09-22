# @oneul-sai/event-service

오늘 사이 오프라인 소개팅 운영 도메인 서비스. (포트 4002)

## 책임

오프라인 소개팅 운영 핵심을 담당한다:

- Meetup
- Schedule
- Application
- Participant
- Check-in
- Rotation

위 항목은 모두 내부 도메인이며, 별도 서비스로 분리하지 않는다.

> 현재는 환경 구성 단계로 health 엔드포인트와 Prisma 연결 구조만 존재한다.
> 모임 개설/신청/체크인/로테이션 등 비즈니스 기능은 기능 구현 단계에서 추가한다.

## 실행 방법

1. 데이터베이스를 먼저 띄운다 (모노레포 루트에서):

   ```bash
   docker compose up -d
   ```

2. Prisma 클라이언트를 생성한다:

   ```bash
   pnpm --filter @oneul-sai/event-service db:generate
   ```

3. 개발 서버를 실행한다:

   ```bash
   pnpm --filter @oneul-sai/event-service dev
   ```

## 환경 변수

`.env.example`을 복사해 `.env`를 만든다.

| 변수           | 기본값                                               | 설명                       |
| -------------- | ---------------------------------------------------- | -------------------------- |
| `PORT`         | `4002`                                               | HTTP 서버 포트             |
| `DATABASE_URL` | `postgresql://oneul:oneul@localhost:5432/event_db` | event_db Postgres 연결 URL |

## Swagger

- http://localhost:4002/docs

## Health

- `GET http://localhost:4002/health`
- 응답: `{ status: 'ok' | 'degraded', service, database: 'up' | 'down', timestamp }`
