# 아키텍처 개요

오늘사이(oneul-sai)는 오프라인 로테이션 소개팅 서비스이며, Monorepo(pnpm workspace + Turborepo) 위에서 Microservice Architecture로 구성한다. 이 문서는 전체 구조와 통신 원칙, 그리고 현재 단계의 구현 범위를 정의한다.

## 1. 전체 구조

```
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Web (:3000)  │   │ Admin (:3001) │   │    Mobile     │
│    Next.js    │   │    Next.js    │   │   Expo (RN)   │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │ REST /api/v1 (x-request-id)
                            ▼
                 ┌─────────────────────┐
                 │ API Gateway (:4000) │
                 └──────────┬──────────┘
                            │ REST (동기)
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│    member     │   │     event     │   │   matching    │
│    (:4001)    │   │    (:4002)    │   │    (:4003)    │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │ publish (비동기 — 구조만 준비)
                            ▼
                    ┌───────────────┐
                    │     Kafka     │
                    └───────┬───────┘
                            │ consume
              ┌─────────────┴─────────────┐
              ▼                           ▼
    ┌──────────────────┐        ┌──────────────────┐
    │   notification   │        │     payment      │
    │     (:4004)      │        │     (:4005)      │
    └──────────────────┘        └──────────────────┘
```

- 클라이언트는 API Gateway(:4000)만 호출한다. 마이크로서비스 직접 호출은 로컬 디버깅 용도로만 허용한다(이때 `x-internal-token`을 직접 실어야 한다).
- 인증(Step 1, [ADR-009](../adr/ADR-009-authentication.md)): 클라이언트는 `Authorization: Bearer <access token>`을 보내고, Gateway가 검증해 `x-user-id` · `x-user-role`로 바꿔 서비스에 넘긴다. Gateway는 프록시하는 모든 요청에 `x-internal-token`을 붙이고, 서비스는 이 값이 맞는 요청만 받는다. refresh token은 Gateway 호스트의 httpOnly 쿠키(`onulsai_rt_web` · `onulsai_rt_admin`)다. 규칙은 [API 규칙 5절](../api/README.md#5-인증--쿠키--cors--rate-limit-step-1).
- payment-service는 이벤트 소비 외에 결제 요청/Webhook 처리를 위해 Gateway의 REST 라우팅(`/api/v1/payments`)도 받는다. 라우팅 테이블은 [API 규칙](../api/README.md) 참고.

## 2. 서비스별 책임

| 서비스               | 포트 | 책임                                                                                                                                                                                                                                                                              |
| -------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| api-gateway          | 4000 | 라우팅, Request ID 발급/전파, **access token 검증 → `x-user-*` 내부 헤더**, 내부 토큰(`x-internal-token`) 부착, `POST /api/v1/auth/*`의 `Origin` 허용 목록 확인, IP 단위 rate limit(인메모리), CORS, 공통 로깅, 공통 에러 정책. 비즈니스 로직 · 경로별 인증 정책 · 역할 판단 없음 |
| member-service       | 4001 | 회원(가입 · 프로필 · 탈퇴 익명화), 로그인 · access token 서명 · refresh 토큰 회전, 비밀번호 변경, 로그인 백오프, 계정 상태(정지 · 해제), 운영자 조회. 온라인 본인인증은 결정 예정 (Step 1 이후), 현장 본인 확인은 event-service 체크인                                            |
| event-service        | 4002 | Meetup, Schedule, Application, Participant, Check-in, Rotation                                                                                                                                                                                                                    |
| matching-service     | 4003 | 호감 선택, Preference, 상호 판별, Match 생성, 결과 제공                                                                                                                                                                                                                           |
| notification-service | 4004 | Push/SMS/Email 발송, 발송 이력                                                                                                                                                                                                                                                    |
| payment-service      | 4005 | 결제 요청/승인/검증/취소, Webhook, 결제 상태 관리                                                                                                                                                                                                                                 |

서비스 경계의 근거는 ADR-004(Service Boundary)에 기록한다.

## 3. 통신 기준: 동기(REST) vs 비동기(Kafka)

- **동기(REST)**: 호출자가 응답을 즉시 필요로 하는 조회/명령. 클라이언트 → Gateway → 서비스 경로가 기본이며, 서비스 간 동기 호출도 REST를 사용한다.
- **비동기(Kafka)**: 호출자가 결과를 기다릴 필요 없는 후속 처리·부수 효과(알림 발송, 결제 후속 처리, 이력 적재 등). 도메인 사건을 `EventEnvelope`(`@oneul-sai/contracts`)로 발행하고, 관심 있는 서비스가 구독한다.
- 판단 기준: "이 작업이 실패해도 원래 요청의 성공 응답을 돌려줄 수 있는가?" — 그렇다면 비동기 후보다.
- **현재 Kafka는 구조만 준비 단계**다(로컬 compose profile + 계약 정의). 상세는 [이벤트 문서](../events/README.md)와 ADR-005/ADR-006 참고.

## 4. Database per Service

- 각 서비스는 자신의 논리 DB만 소유한다: `member_db`, `event_db`, `matching_db`, `notification_db`, `payment_db`.
- **개발 환경에서는 PostgreSQL 인스턴스 하나를 공유**하되(`docker compose up -d`, init 스크립트가 논리 DB 5개 생성), 소유권은 논리 DB 단위로 엄격히 분리한다.
- **다른 서비스의 DB를 직접 조회하는 것은 금지**다(cross-DB 쿼리, FK 참조 포함). 다른 서비스의 데이터가 필요하면 REST 호출 또는 Kafka 이벤트로만 얻는다.
- 상세는 [데이터베이스 문서](../database/README.md)와 ADR-007 참고.

## 5. Monorepo 구조

```
oneul-sai/
├── apps/
│   ├── web/                    # Next.js 사용자 웹 (:3000)
│   ├── admin/                  # Next.js 운영자 웹 (:3001)
│   ├── mobile/                 # Expo(React Native) 앱
│   ├── api-gateway/            # NestJS API Gateway (:4000)
│   ├── member-service/         # NestJS (:4001)
│   ├── event-service/          # NestJS (:4002)
│   ├── matching-service/       # NestJS (:4003)
│   ├── notification-service/   # NestJS (:4004)
│   └── payment-service/        # NestJS (:4005)
├── packages/
│   ├── contracts/              # 서비스 간 API/Event 계약 (ApiErrorResponse, EventEnvelope)
│   ├── types/                  # 플랫폼 독립 공통 타입
│   ├── constants/              # 공통 상수
│   ├── utils/                  # 공통 유틸 함수
│   ├── config/                 # 환경 변수 검증 헬퍼 (zod + dotenv)
│   ├── logger/                 # 공통 구조화(JSON) 로거
│   ├── kafka/                  # Kafka 공통 코드 자리 (구조만 준비)
│   ├── api-client/             # 프론트엔드용 API 클라이언트
│   ├── ui/                     # Web/Admin 공유 React 컴포넌트
│   ├── typescript-config/      # 공유 tsconfig 프리셋
│   └── eslint-config/          # 공유 ESLint flat config
├── infra/
│   ├── docker/                 # 로컬 Postgres/Kafka compose + init 스크립트
│   ├── kubernetes/             # K8s 매니페스트 자리 (Kustomize, 구조만 준비)
│   ├── helm/                   # 서드파티 차트 values 자리 (구조만 준비)
│   └── monitoring/             # 모니터링 구성 자리 (구조만 준비)
└── docs/                       # overview / specs / architecture / adr / api / database / events / design / guides (지도: docs/README.md)
```

- 패키지 이름은 `@oneul-sai/<name>`, 앱 간 코드 공유는 반드시 `packages/`를 통해서만 한다.
- 빌드 파이프라인은 Turborepo가 관리한다(`dev`/`build`/`lint`/`typecheck`/`test`/`db:generate`).

## 6. Request ID 전파

요청 단위 추적을 위해 `x-request-id` 헤더를 전 구간에 전파한다.

1. 클라이언트가 `x-request-id`를 보내면 그대로 사용하고, 없으면 **Gateway가 UUID를 생성**한다.
2. Gateway는 다운스트림 서비스 호출 시 같은 헤더를 그대로 전달하고, 클라이언트 응답에도 포함한다.
3. 각 서비스는 요청 로그와 에러 응답(`ApiErrorResponse.requestId`)에 이 값을 남긴다. 서비스가 다른 서비스를 REST로 호출할 때도 헤더를 이어서 전달한다.
4. Kafka 이벤트로의 전파(correlation id를 envelope에 실을지 여부)는 실제 이벤트 구현 단계에서 결정한다.

## 7. 현재 구현 범위

| 구분                                                                                  | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **현재 구현됨**                                                                       | Monorepo wiring(pnpm + Turborepo, 공유 tsconfig/ESLint), 각 서비스 `/health` 엔드포인트, Gateway 라우팅과 Request ID 전파, Prisma 7 클라이언트 생성 파이프라인(`db:generate`), 로컬 Postgres(논리 DB 5개) compose, 공유 패키지 골격, CI(`ci` 잡 lint/typecheck/test/build + `integration` 잡 Postgres 통합 테스트)                                                                                                                                                                                               |
| **구현됨 — Step 1 회원/인증** ([SPEC-001](../specs/SPEC-001-member-auth.md), 검증 중) | member-service: 가입 · 로그인 · refresh 회전(유예 창 · 재사용 탐지) · 로그아웃 · 모든 기기 로그아웃 · 비밀번호 변경 · 프로필 · 탈퇴(즉시 익명화) · 운영자 목록 · 상세 · 계정 상태 변경, 로그인 백오프, `member_db` 마이그레이션 `init_member` · ADMIN seed. api-gateway: JWT 검증 · `x-user-*` · 내부 토큰 · `Origin` 확인 · IP rate limit · CORS. contracts/api-client: Zod 스키마 · 에러 코드 · 인증 흐름. web: 가입 · 로그인 · 내 프로필 · 비밀번호 변경 · 탈퇴. admin: 로그인 · 회원 목록 · 상세 · 정지/해제 |
| **구조만 준비**                                                                       | Kafka(로컬 compose profile + `EventEnvelope` 계약 + `@oneul-sai/kafka` 자리), notification/payment의 이벤트 소비 구조, `infra/kubernetes`·`infra/helm`·`infra/monitoring` 디렉토리                                                                                                                                                                                                                                                                                                                               |
| **미구현**                                                                            | Meetup/Schedule(Step 2), Application(Step 3), 결제 + 첫 Kafka 이벤트 발행/구독(Step 4), Check-in/Rotation · 참가자 앱 로그인(Step 5), 매칭(Step 6), 알림(Step 7), 서비스 간 REST, 분산 rate limit · 거부 목록 · 배포 파이프라인과 K8s 매니페스트(Step 8)                                                                                                                                                                                                                                                         |

새 기능은 "미구현" 목록에서 꺼내 구현하며, 이때 관련 문서(API 규칙, 이벤트, ADR)를 함께 갱신한다.
