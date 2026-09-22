# 오늘 사이 (oneul-sai)

**오프라인 로테이션 소개팅 서비스.** 참가자들이 오프라인 이벤트에 모여 정해진 시간마다 자리를 옮겨가며(로테이션) 서로를 만나고, 이후 상호 선택을 통해 매칭되는 서비스입니다.

이 프로젝트는 두 가지를 동시에 목표로 합니다.

1. **실제 운영 가능한 서비스**: 실사용을 전제로 한 기능, 운영, 배포.
2. **기술적 완성도**: MSA 경계, 계약(Contract) 기반 통신, 타입 안정성, 테스트와 CI까지 갖춘 코드베이스.

> 원칙: 기술 과시를 위한 구현은 하지 않는다. 모든 기술 선택은 서비스 요구에서 출발한다.

---

## Architecture 개요

```
                ┌─────────────────────────────────────────────┐
                │                   Clients                   │
                │   Web (Next.js)  Mobile (Expo)  Admin       │
                └───────────────────────┬─────────────────────┘
                                        │ HTTPS (REST, /api/v1)
                                        ▼
                            ┌───────────────────────┐
                            │      API Gateway      │
                            │        :4000          │
                            └───────────┬───────────┘
                                        │ HTTP (proxy)
        ┌───────────────┬───────────────┼───────────────┬───────────────┐
        ▼               ▼               ▼               ▼               ▼
  ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌────────────┐  ┌───────────┐
  │  member   │   │   event   │   │ matching  │   │notification│  │  payment  │
  │  :4001    │   │   :4002   │   │   :4003   │   │   :4004    │  │   :4005   │
  └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬──────┘  └─────┬─────┘
        │               │               │               │               │
        ▼               ▼               ▼               ▼               ▼
   member_db        event_db       matching_db    notification_db   payment_db
                     (PostgreSQL — Database per Service)

        ─────────────────────── Kafka (Event Bus) ───────────────────────
          서비스 간 비동기 통신용. 현재는 구조(패키지/토픽 규약)만 준비.
```

자세한 내용은 [docs/architecture/overview.md](docs/architecture/overview.md)를 참고하세요.

---

## Monorepo 구조

```
oneul-sai/
├── apps/
│   ├── web/                  # 사용자 웹 (Next.js)
│   ├── admin/                # 운영 어드민 웹 (Next.js)
│   ├── mobile/               # 모바일 앱 (Expo / React Native)
│   ├── api-gateway/          # API 게이트웨이 (NestJS, 라우팅/프록시)
│   ├── member-service/       # 회원 도메인 마이크로서비스 (NestJS + Prisma)
│   ├── event-service/        # 소개팅 이벤트 도메인 마이크로서비스
│   ├── matching-service/     # 매칭 도메인 마이크로서비스
│   ├── notification-service/ # 알림 도메인 마이크로서비스
│   └── payment-service/      # 결제 도메인 마이크로서비스
├── packages/
│   ├── contracts/            # 서비스 간 API/이벤트 계약 (Zod 스키마, DTO)
│   ├── api-client/           # 프론트엔드용 타입 안전 API 클라이언트
│   ├── kafka/                # Kafka 프로듀서/컨슈머 공통 래퍼 (구조만)
│   ├── logger/               # 구조화 로깅 공통 모듈
│   ├── config/               # 환경 변수 로딩/검증 (Zod 기반)
│   ├── types/                # 공유 TypeScript 타입
│   ├── constants/            # 공유 상수 (포트, 헤더명 등)
│   ├── utils/                # 공유 유틸 함수
│   ├── ui/                   # 공유 React UI 컴포넌트
│   ├── eslint-config/        # 공유 ESLint flat config
│   └── typescript-config/    # 공유 tsconfig 프리셋
├── infra/
│   ├── docker/               # 로컬 인프라 compose 정의 (PostgreSQL, Kafka)
│   ├── kubernetes/           # K8s 매니페스트 (구조만)
│   ├── helm/                 # Helm 차트 (구조만)
│   └── monitoring/           # 모니터링 구성 (구조만)
└── docs/
    ├── architecture/         # 아키텍처 문서
    ├── adr/                  # Architecture Decision Records
    ├── api/                  # API 문서
    ├── database/             # DB 스키마/설계 문서
    └── events/               # Kafka 이벤트/토픽 문서
```

### Applications

| 이름 | 포트 | 역할 |
| --- | --- | --- |
| `@oneul-sai/web` | 3000 | 사용자용 웹 프론트엔드 (Next.js) |
| `@oneul-sai/admin` | 3001 | 운영자용 어드민 웹 (Next.js) |
| `@oneul-sai/mobile` | - | 모바일 앱 (Expo / React Native) |

### Microservices

| 이름 | 포트 | 역할 |
| --- | --- | --- |
| `@oneul-sai/api-gateway` | 4000 | 단일 진입점. 인증/요청 ID 부여, 각 서비스로 라우팅·프록시 |
| `@oneul-sai/member-service` | 4001 | 회원 (가입/프로필) 도메인. DB: `member_db` |
| `@oneul-sai/event-service` | 4002 | 소개팅 이벤트 (개설/신청) 도메인. DB: `event_db` |
| `@oneul-sai/matching-service` | 4003 | 로테이션/상호 선택/매칭 도메인. DB: `matching_db` |
| `@oneul-sai/notification-service` | 4004 | 알림 (푸시/메시지) 도메인. DB: `notification_db` |
| `@oneul-sai/payment-service` | 4005 | 결제 도메인. DB: `payment_db` |

### Shared Packages

| 이름 | 역할 |
| --- | --- |
| `@oneul-sai/contracts` | 서비스 간 공유되는 유일한 것: API/이벤트 계약 (Zod 스키마) |
| `@oneul-sai/api-client` | contracts 기반 타입 안전 HTTP 클라이언트 (프론트엔드용) |
| `@oneul-sai/kafka` | Kafka 연동 공통 래퍼 (현재 구조만) |
| `@oneul-sai/logger` | 구조화 로깅 |
| `@oneul-sai/config` | 환경 변수 로딩·Zod 검증 |
| `@oneul-sai/types` | 공유 타입 |
| `@oneul-sai/constants` | 공유 상수 (포트, `x-request-id` 헤더명 등) |
| `@oneul-sai/utils` | 공유 유틸 |
| `@oneul-sai/ui` | 공유 React 컴포넌트 |
| `@oneul-sai/eslint-config` | ESLint 9 flat config 프리셋 |
| `@oneul-sai/typescript-config` | tsconfig 프리셋 (base/library/nestjs/nextjs/react-library) |

---

## 기술 스택

- **Web/Admin**: Next.js 16, React 19, Tailwind CSS 4, TanStack Query, React Hook Form, Zod
- **Mobile**: Expo SDK 57 (React Native 0.86)
- **Backend**: NestJS 12 (ESM), Prisma 7, PostgreSQL 17, Swagger
- **Messaging**: Kafka (현재 구조만 준비)
- **Tooling**: Turborepo 2, pnpm 11, TypeScript 6, vitest, ESLint 9 + Prettier
- **Infra**: Docker, Kubernetes (구조만), GitHub Actions

---

## 요구 개발 환경

- Node.js >= 22.12
- pnpm 11 (`corepack enable` 또는 `npm i -g pnpm`)
- Docker Desktop (PostgreSQL/Kafka 로컬 실행용)

---

## 설치

```bash
# 1. 의존성 설치
pnpm install

# 2. PostgreSQL 실행 (member_db 등 5개 논리 DB가 자동 생성됨)
docker compose up -d

#    Kafka까지 함께 띄우려면 (선택):
docker compose --profile kafka up -d

# 3. Prisma Client 생성
pnpm db:generate
```

---

## 실행 방법

루트에서 실행하는 명령은 Turborepo를 통해 전체 workspace에 적용됩니다.

```bash
pnpm dev        # 모든 앱/서비스 dev 모드 실행
pnpm build      # 전체 빌드
pnpm lint       # 전체 린트
pnpm typecheck  # 전체 타입 체크
pnpm test       # 전체 테스트 (vitest)
```

개별 실행은 `--filter`를 사용합니다.

```bash
pnpm --filter @oneul-sai/web dev              # Web           http://localhost:3000
pnpm --filter @oneul-sai/admin dev            # Admin         http://localhost:3001
pnpm --filter @oneul-sai/mobile start         # Mobile (Expo)
pnpm --filter @oneul-sai/api-gateway dev      # Gateway       http://localhost:4000
pnpm --filter @oneul-sai/member-service dev   # Member        http://localhost:4001
```

각 백엔드 서비스는 다음 엔드포인트를 제공합니다.

- Swagger: `http://localhost:<port>/docs`
- Health: `http://localhost:<port>/health`

---

## 환경 변수

- 루트 [.env.example](.env.example)에 전체 변수 목록이 있습니다.
- 각 앱/서비스 디렉토리에도 `.env.example`이 있으며, 이를 `.env`로 복사해 사용합니다.

```bash
cp apps/member-service/.env.example apps/member-service/.env
```

- **Secret(API 키, 비밀번호 등)은 절대 커밋하지 않습니다.** `.env`는 `.gitignore`에 포함되어 있습니다.

---

## Docker

각 서비스는 `apps/<service>/Dockerfile`을 가지며, `turbo prune` 기반으로 해당 서비스에 필요한 workspace만 담은 독립 이미지를 빌드합니다.

```bash
# 루트에서 실행
docker build -f apps/member-service/Dockerfile -t oneul-sai/member-service .
```

---

## 주요 Architecture 원칙

1. **MSA 경계 유지**: 각 서비스는 자기 도메인만 소유한다.
2. **Database per Service**: 서비스는 자신의 DB만 접근한다. 타 서비스 DB 직접 접근 금지.
3. **Sync/Async 구분**: 즉시 응답이 필요한 조회·명령은 REST(Gateway 경유), 도메인 이벤트 전파는 Kafka.
4. **Shared Package에 비즈니스 로직 금지**: 서비스 간에는 Contract(스키마/타입)만 공유한다.
5. **TypeScript strict**: 모든 패키지에서 strict 모드.
6. **불필요한 추상화 금지**: 현재 요구에 없는 확장 포인트를 미리 만들지 않는다.

각 결정의 배경은 [docs/adr](docs/adr)을 참고하세요.

---

## 현재 상태와 Roadmap

현재는 **초기 환경 구축 단계**입니다. 비즈니스 기능은 아직 구현되지 않았습니다.

| 상태 | 항목 |
| --- | --- |
| 구현됨 | pnpm workspace + Turborepo, 앱/서비스 스캐폴드, Health 엔드포인트, Prisma DB 연결, CI (GitHub Actions) |
| 구조만 준비 | Kafka, Kubernetes/Helm, Redis, Monitoring |
| 미구현 | 회원가입, 이벤트 신청, 결제, 체크인/로테이션, 매칭 등 모든 비즈니스 기능 |

### Roadmap (제안 순서)

1. 인증/회원 (member-service)
2. 이벤트 개설/신청 — 정원 동시성 제어 (event-service)
3. 결제 (payment-service)
4. 현장 체크인/로테이션 진행 (event-service)
5. 매칭/알림 — Kafka 도입 (matching-service, notification-service)
6. K8s 배포/모니터링
