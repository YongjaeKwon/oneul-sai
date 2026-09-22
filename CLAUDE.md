# CLAUDE.md — 오늘사이 작업 규칙

AI 코딩 에이전트(Claude Code 등)를 위한 작업 규칙이다. 사람도 같은 규칙을 따른다.
사람용 진입 문서는 [CONTRIBUTING.md](CONTRIBUTING.md), 상세 규칙은 `docs/guides/`, 문서 지도는 `docs/README.md`.

## 1. 프로젝트 한 줄

**오늘사이(ONULSAI)** — 오프라인 로테이션 소개팅. 일요일 카페에서 7명과 1:1로 대화하고(로테이션), **서로 선택한 경우에만** 연결된다.
네 가지 개념: **TODAY · ONE MORE · AFTER · NEXT** (순서 고정). 상세: `docs/overview/project-overview.md`, 용어는 `docs/overview/glossary.md`. 태그라인 "오늘, 우리 사이의 시작."
브랜드 표기는 반드시 **붙여쓰기** "오늘사이". 영문 ONULSAI. 문체는 정중한 존댓말, 짧고 따뜻하게.
현재 운영은 수동이다: 신청 → 계좌이체 입금 확인 → 카카오 알림톡 참가 확정 → 현장에서 신분증 확인. PG 연동은 이후 단계.

## 2. 구조

```
apps/      web(3000) admin(3001) mobile(Expo) | api-gateway(4000)
           member(4001,member_db) event(4002,event_db) matching(4003,matching_db)
           notification(4004,notification_db) payment(4005,payment_db)
packages/  contracts api-client kafka logger config types constants utils ui eslint-config typescript-config
infra/     docker(compose)  kubernetes helm monitoring(구조만)
docs/      overview specs architecture adr api database events design guides
```

- 외부 요청은 Gateway만 받는다. `/api/v1/**`를 서비스로 프록시. 라우팅 표: `docs/api/README.md`.
- 인증(SPEC-001, ADR-009): Gateway가 `Authorization: Bearer`(JWT HS256)를 검증해 `x-user-id` · `x-user-role`로 바꾸고 모든 프록시 요청에 `x-internal-token`을 붙인다. 서비스는 `x-internal-token`을 먼저 확인하고 `Authorization`은 보지 않는다. 어느 엔드포인트가 공개인지는 서비스의 `@Public()`이 원천(Gateway에 경로별 정책 없음). 규칙: `docs/api/README.md` 5절.
- notification은 외부 라우팅 없음(이벤트 소비자). Kafka는 **구조만** 있다.
- 현재 단계: **Step 0 · Step 1(회원/인증) 완료, Step 2 소개팅 상품/일정 설계 중.** 그 밖의 비즈니스 기능은 아직 없다. 로드맵 9단계는 5장.

## 3. 반드시 지킬 원칙

1. **MSA 경계** — 서비스는 자기 도메인만 소유. Gateway에 비즈니스 로직 금지.
2. **Database per Service** — 타 서비스 DB 접근 금지(쿼리 · FK · Prisma 모델 참조 모두). 필요하면 REST 또는 이벤트.
3. **REST 동기 / Kafka 비동기** — 기준: "이 작업이 실패해도 원래 요청은 성공 응답을 줄 수 있는가?" 그렇다면 비동기 후보.
4. **공유 패키지에 비즈니스 로직 금지** — 서비스 간 공유는 `@oneul-sai/contracts`(스키마 · 타입)만.
5. **TypeScript strict** — 모든 패키지. `any` 회피, `unknown` + narrowing.
6. **불필요한 추상화 · 기술 과시 금지** — 지금 요구에 없는 확장 포인트 · 레이어 · 제네릭을 만들지 않는다.
7. **비즈니스 기능 임의 구현 금지** — `docs/specs/SPEC-00N-<slug>.md`로 머지된 설계서가 있는 기능만 구현한다. 없으면 `docs/specs/TEMPLATE.md`로 초안을 먼저 쓰고 사람의 확인을 기다린다(001~008은 Step 1~8에 예약, 목록은 `docs/specs/README.md`).
8. **제품 사실을 지어내지 않는다** — 팜플렛 · 운영 메시지에 있는 것만. 미정은 **"결정 예정 (Step N)"** 으로 쓴다.

근거: `docs/adr/` (ADR-001~008, 인증은 [ADR-009](docs/adr/ADR-009-authentication.md)). 결정을 바꾸려면 새 ADR.

## 4. 자주 쓰는 커맨드

```bash
docker compose up -d                 # Postgres 17 + 논리 DB 5개   (--profile kafka 로 Kafka 추가)
pnpm install && pnpm db:generate     # clone 직후. generate 없이는 typecheck가 깨진다
pnpm dev | build | lint | typecheck | test | format | format:check
pnpm --filter @oneul-sai/member-service dev      # 하나만
pnpm --filter @oneul-sai/member-service db:generate
pnpm --filter @oneul-sai/member-service exec prisma migrate dev   # 커밋된 마이그레이션 적용 (member_db)
pnpm --filter @oneul-sai/member-service build && pnpm --filter @oneul-sai/member-service db:seed   # ADMIN 계정
pnpm --filter @oneul-sai/member-service test:integration          # 실제 member_db 통합 테스트 (테이블을 비운다 → 뒤에 db:seed)
curl http://localhost:4001/health                 # {status, service, database, timestamp}
```

- **Nest CLI(`nest`)를 쓰지 않는다.** Node 22.14 크래시. 빌드는 `tsc -p tsconfig.build.json`, dev는 `tsc-watch`.
- 루트 명령은 Turborepo가 전 workspace에 돌린다. `dev`/`build`/`typecheck`/`test`는 `db:generate`에 의존.
- 새 의존성이 build 스크립트를 가지면 `pnpm-workspace.yaml`의 `allowBuilds`에 추가하고 이유를 PR에 쓴다.
- 버전 · 알려진 함정 8개(Nest CLI, TS6 @types, pnpm 11 설정 위치, Prisma 7, http-proxy-middleware v3 유지, ESM import, Next 16/Tailwind 4, Expo 57)의 원천은 `docs/architecture/tech-stack.md`. 의존성을 올리기 전에 읽는다.

## 5. 로드맵 (Step)

| Step | 내용                                                   | 상태 |
| ---- | ------------------------------------------------------ | ---- |
| 0    | 기반 마무리(문서 · 협업 규칙 · 설정)                   | 완료 |
| 1    | 회원/인증 (member, gateway, web, admin)                | 완료 |
| 2    | 소개팅 상품/일정 (event)                               | 예정 |
| 3    | 참가 신청 — 성별 정원 동시성 (event)                   | 예정 |
| 4    | 결제 + 첫 Kafka (payment) — 초기엔 입금 확인 기반 가능 | 예정 |
| 5    | 현장 운영 — 체크인 · 로테이션 (event)                  | 예정 |
| 6    | 매칭 — 상호 선택 · ONE MORE · AFTER (matching)         | 예정 |
| 7    | 알림 — 알림톡 · Push (notification)                    | 예정 |
| 8    | 운영 준비 — K8s · 모니터링 (infra)                     | 예정 |

Step 번호 · 이름 · 상태의 원천은 `docs/overview/project-overview.md` 5장. 이 표는 그 사본이며, Step 상태가 바뀌면 함께 갱신한다. 진행 상황판(8장)은 빠르게 보는 용도이고, 문서와 어긋나면 문서가 원천이다(`docs/guides/documentation-rules.md` 6절).

## 6. 코드 규약

**ESM.** 모든 패키지 `"type": "module"`. 상대 import는 **`.js` 확장자**를 쓴다(`./app.module.js`, `../env.js`). 타입만 쓰면 `import type`. Node 내장은 `node:crypto`처럼 접두사.

**환경 변수.** 각 앱 `src/env.ts`에서 `@oneul-sai/config`의 `parseEnv(z.object({...}))`로 검증 · 기본값. `main.ts`는 dotenv 부수효과 때문에 `./env.js`를 **첫 줄**에 import. 새 변수는 루트 · 앱 `.env.example`과 앱 README 표에 함께 추가. `process.env`를 직접 읽지 않는다.

**Prisma 7.** 패턴은 `apps/member-service`를 그대로 따른다.

| 파일                           | 역할                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`         | `generator client { provider = "prisma-client", output = "../src/generated/prisma" }`. datasource에 url 없음        |
| `prisma.config.ts`             | `import 'dotenv/config'` + `defineConfig({ schema, migrations, datasource: { url: process.env['DATABASE_URL'] } })` |
| `src/prisma/prisma.service.ts` | `PrismaClient` 상속, `new PrismaPg({ connectionString })` 어댑터 필수, `onModuleDestroy`에서 `$disconnect`          |
| `src/prisma/prisma.module.ts`  | `PrismaService` provide/export                                                                                      |
| `src/generated/`               | gitignore. 커밋 금지                                                                                                |

마이그레이션은 실제 모델이 생기는 Step에서 시작(`prisma migrate dev`). 스키마 변경 → migrate → generate 순서.

**NestJS.** 컨트롤러 · 서비스 · 모듈은 도메인 폴더(`src/<domain>/`). Swagger 데코레이터(`@ApiOperation`, `@ApiOkResponse`)를 엔드포인트마다 단다. 에러는 `@oneul-sai/contracts`의 `ApiErrorResponse` 형태. 로그는 `@oneul-sai/logger`의 `createLogger({ service })`, `console.log` 금지. `x-request-id`는 다운스트림 호출에 이어서 전달.

**테스트.** vitest, `*.spec.ts`를 소스 옆에. `globals: true`. Nest `TestingModule` 대신 **직접 인스턴스화**: `new HealthController(fakePrisma as unknown as PrismaService)`. 외부 의존은 최소 가짜 객체로. 통과용 · 스냅샷 테스트 금지.

**TypeScript 6.** `@types`가 자동 포함되지 않는다. `process`/`Buffer`를 쓰는 패키지는 tsconfig `"types": ["node"]`(vitest면 `["node", "vitest/globals"]`). tsconfig는 `@oneul-sai/typescript-config/{base,library,nestjs,nextjs,react-library}.json`을 extends.

**프론트엔드.** Next 16(Turbopack) + Tailwind 4 + TanStack Query + React Hook Form + Zod. API 호출은 `@oneul-sai/api-client`만 통해 Gateway(4000)로. 공용 UI는 `packages/ui`(웹 전용, 소스 소비). 디자인 토큰 · 폰트 · 컴포넌트 원칙은 `docs/design/design-foundation.md`를 따른다 — 임의 색 · 폰트 금지.

**포맷.** Prettier(single quote, trailing comma all), ESLint 9 flat(`@oneul-sai/eslint-config/base`; Next 앱은 `eslint-config-next`). 커밋 전 `pnpm format:check && pnpm lint`.

## 7. 문서 갱신 의무

코드가 바뀌면 **같은 PR**에서 문서를 갱신한다. 원천: `docs/guides/documentation-rules.md`. 요약:

| 변경                                 | 갱신                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| 새 기능 착수                         | `docs/specs/SPEC-00N-<slug>.md` **먼저**, 상황판                                         |
| 기능 구현 완료                       | 설계서 "17. 실제 구현과의 차이", `docs/overview/features/`, 상황판                       |
| API 추가 · 변경                      | Swagger 데코레이터, `docs/api/README.md`(인덱스 표), `packages/contracts` + `api-client` |
| Prisma 스키마                        | `docs/database/README.md`, 설계서 "9. DB 변경"                                           |
| Kafka 이벤트                         | `docs/events/README.md`, `packages/contracts`, 설계서 "8. 이벤트"                        |
| 아키텍처 결정                        | 새 ADR + `docs/adr/README.md` 인덱스, `docs/architecture/overview.md`                    |
| 의존성 메이저 · 새 기술              | `docs/architecture/tech-stack.md` (되돌리기 어렵다면 ADR)                                |
| 환경 변수                            | 루트 · 앱 `.env.example`, 앱 README                                                      |
| 새 앱 · 패키지                       | 루트 README, 아키텍처 개요, 디렉토리 README, `.github/CODEOWNERS`                        |
| 커맨드 · 툴체인                      | 루트 README, CONTRIBUTING, `docs/guides/onboarding.md`, 이 파일                          |
| 사용자에게 보이는 규칙 · 문구 · 용어 | `docs/overview/features/`, `docs/overview/glossary.md`                                   |

## 8. 커밋 · PR · 상황판

원천은 `docs/guides/branching-and-commits.md`(브랜치 · 커밋)와 `docs/guides/pull-requests.md`(PR · Definition of Done). 아래는 요약이다.

- **커밋**: Conventional Commits + 한국어 제목, 50자 안, 본문에 "왜". scope: `repo packages services apps infra docs web admin mobile gateway member event matching notification payment` 또는 패키지명.
  예) `feat(services): API Gateway + NestJS 서비스 5개 뼈대` / `docs: README, 아키텍처 개요, ADR 8건, API/DB/이벤트 가이드`
- **의미 단위로 쪼갠다.** 설계서 / Contract / 구현 / 문서는 별도 커밋. 각 커밋은 빌드 가능해야 한다.
- 커밋 트레일러에 AI를 `Co-Authored-By`로 적지 않는다 — 저자는 항상 사람이다(프로젝트 방침). 사람이 시키지 않으면 commit · push 하지 않는다.
- **브랜치**: `<type>/<step>-<topic>` (`feat/step1-auth`). `main` 직접 push 금지.
- **PR**: `.github/PULL_REQUEST_TEMPLATE.md`를 채운다. 작게. CI 초록 + 리뷰 1. Definition of Done — PR 단위는 `docs/guides/pull-requests.md` 7절, Step 단위는 `docs/README.md` 4절.
- **상황판**: <https://claude.ai/artifact/M3foVY7pn38tXo5QguZvXa> — Step 착수 · 설계서 머지 · 구현 머지 · Step 완료 시 갱신. 문서와 어긋나면 문서가 원천.

## 9. 하지 말 것

- 설계서 없는 비즈니스 기능 구현. "일단 만들어 보기" 금지.
- 팜플렛 · 운영 메시지에 없는 제품 기능 · 문구 · 정책을 만들어 내기.
- 타 서비스 DB · Prisma 모델 · 테이블 이름 참조. cross-DB JOIN.
- `packages/*`에 도메인 규칙(정원 계산, 매칭 판별, 결제 상태 전이 등) 넣기.
- Gateway에 비즈니스 로직 · 경로별 인증 정책 · 역할 판단. Gateway는 라우팅 · request-id · 로깅 · 에러 정책 + 토큰 검증 · 내부 헤더 · 내부 토큰 부착 · `Origin` 확인 · IP rate limit · CORS까지만(ADR-009).
- Nest CLI 사용. `console.log`. `process.env` 직접 접근. `any`.
- `src/generated/`, `dist/`, `.env`, `.turbo/` 커밋.
- 상대 import에 `.js` 확장자 빠뜨리기(ESM 런타임에서 깨진다).
- "오늘 사이"처럼 브랜드를 띄어 쓰기.
- 미정 사항을 정해진 것처럼 쓰기. 반드시 "결정 예정 (Step N)".
- `packages/ui`, `apps/web`, `apps/admin`, `docs/design/*`를 디자인 파운데이션 확인 없이 임의로 스타일링.
- 지시 없이 commit · push · 의존성 추가 · 설정 파일(`pnpm-workspace.yaml`, `turbo.json`, CI) 변경.
