# @oneul-sai/member-service

오늘사이 회원 도메인 서비스. (포트 4001)

## 책임

- 회원
- 로그인
- 인증
- 프로필
- 본인 인증 정보
- 계정 상태

이 서비스는 다른 도메인의 비즈니스 데이터를 관리하지 않는다.

> 현재는 환경 구성 단계로 health 엔드포인트와 Prisma 연결 구조만 존재한다.
> 회원가입/로그인 등 비즈니스 기능은 기능 구현 단계에서 추가한다.

## 실행 방법

1. 데이터베이스를 먼저 띄운다 (모노레포 루트에서):

   ```bash
   docker compose up -d
   ```

2. Prisma 클라이언트를 생성한다:

   ```bash
   pnpm --filter @oneul-sai/member-service db:generate
   ```

3. 개발 서버를 실행한다:

   ```bash
   pnpm --filter @oneul-sai/member-service dev
   ```

## 환경 변수

`.env.example`을 복사해 `.env`를 만든다.

| 변수           | 기본값                                                | 설명                       |
| -------------- | ----------------------------------------------------- | -------------------------- |
| `PORT`         | `4001`                                                | HTTP 서버 포트             |
| `DATABASE_URL` | `postgresql://oneul:oneul@localhost:5432/member_db` | member_db Postgres 연결 URL |

## Swagger

- http://localhost:4001/docs

## Health

- `GET http://localhost:4001/health`
- 응답: `{ status: 'ok' | 'degraded', service, database: 'up' | 'down', timestamp }`
