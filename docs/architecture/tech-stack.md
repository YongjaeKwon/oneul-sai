# 기술 스택과 버전 결정

오늘사이가 쓰는 기술과 버전, 각 선택의 이유, 그리고 알려진 함정을 기록한다. 버전을 올리거나 새 기술을 들일 때 이 문서를 먼저 읽고, 바꾼 뒤 이 문서를 갱신한다.

- 상태: 확정
- 최종 갱신: 2026-09-25 (event-service `partialIndexes` 미리보기 · 함정 11. 그 전: 2026-09-24 에이전트 디자인 · 확인 도구 표 추가. 그 전: 2026-09-22 npm registry 실측 + 공식 템플릿 생성으로 확정)
- 원천: 루트 `package.json`, `pnpm-workspace.yaml`, 각 앱·패키지의 `package.json`과 tsconfig. 이 문서와 다르면 코드가 맞다. 이 문서를 고친다.
- 구조와 통신 원칙은 [아키텍처 개요](./overview.md), 결정의 배경은 [ADR](../adr/README.md).

## 1. 한눈에 보기

### 공통

| 영역          | 선택                                   | 버전                            | 한 줄 이유                                                                                   |
| ------------- | -------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| 런타임        | Node.js                                | 22 (`>=22.12`, 개발 머신 22.14) | LTS. Next 16·Expo 57·Prisma 7의 공통 하한                                                    |
| 언어          | TypeScript                             | `~6.0.3` (전 패키지 통일)       | strict 모드. TS 7(네이티브)은 typescript-eslint와 Nest 도구가 아직 API를 못 쓴다             |
| 패키지 매니저 | pnpm                                   | 11 (`pnpm@11.24.0`)             | workspace, 엄격한 의존성 격리, `allowBuilds`로 빌드 스크립트를 명시 통제                     |
| 모노레포 빌드 | Turborepo                              | 2                               | 태스크 그래프·캐시. `db:generate → build/typecheck/dev` 의존을 한 곳에서 연결                |
| 린트          | ESLint flat config + typescript-eslint | 9 / 8.70                        | `eslint-config-next` 16이 ESLint 9를 요구. 공유 프리셋은 `@oneul-sai/eslint-config`          |
| 포맷          | Prettier                               | 3                               | single quote, trailing comma. 루트 `pnpm format`                                             |
| 스키마 검증   | Zod                                    | 4                               | contracts·config·프론트 폼에서 같은 스키마를 쓴다                                            |
| CI            | GitHub Actions                         | —                               | `pnpm turbo run lint typecheck test build` 한 잡. 변경 범위(`--affected`) 최적화는 이후 단계 |

### 백엔드

| 영역           | 선택                                                                  | 버전      | 한 줄 이유                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 프레임워크     | NestJS (ESM)                                                          | 12        | 모듈·DI·데코레이터로 서비스 5개의 구조를 같게 유지. Swagger 통합                                                                                                    |
| API 문서       | @nestjs/swagger                                                       | 12        | 컨트롤러 데코레이터가 API 문서의 원천                                                                                                                               |
| 테스트         | vitest                                                                | 4         | ESM 친화, 빠름. jest는 쓰지 않는다                                                                                                                                  |
| 빌드·실행      | tsc + tsc-watch                                                       | —         | Nest CLI를 쓰지 않는다(아래 함정 1). `build`는 `tsc -p tsconfig.build.json`, `dev`는 `tsc-watch --onSuccess "node dist/main.js"`                                    |
| ORM            | Prisma                                                                | `7.10.0`  | 타입 안전 쿼리·마이그레이션. `prisma-client` generator + `@prisma/adapter-pg`. event-service만 `previewFeatures = ["partialIndexes"]`(부분 유니크 인덱스, SPEC-003) |
| DB             | PostgreSQL                                                            | 17        | 서비스별 논리 DB 5개. 로컬은 Docker Compose                                                                                                                         |
| Gateway 프록시 | http-proxy-middleware                                                 | `^3.0.7`  | v3 유지(아래 함정 5)                                                                                                                                                |
| 메시징         | Kafka (KRaft 단일 노드)                                               | —         | 현재 구조만. `docker compose --profile kafka up -d`                                                                                                                 |
| 로깅           | `@oneul-sai/logger`                                                   | —         | JSON 구조화 로그. `x-request-id`를 함께 남긴다                                                                                                                      |
| 환경 변수      | dotenv + Zod (`@oneul-sai/config`)                                    | dotenv 18 | 서비스 부팅 시 검증. 잘못된 값이면 바로 실패                                                                                                                        |
| 인증           | JWT(jose) HS256 + 불투명 refresh 쿠키, 비밀번호 scrypt(`node:crypto`) | jose 6    | member-service가 서명하고 Gateway가 검증한다(SPEC-001, ADR-009). 해시는 네이티브 빌드가 없는 scrypt(아래 함정 9)                                                    |

### 프론트엔드

| 영역        | 선택                                    | 버전          | 한 줄 이유                                                               |
| ----------- | --------------------------------------- | ------------- | ------------------------------------------------------------------------ |
| Web / Admin | Next.js (Turbopack)                     | `16.3.5`      | App Router, 서버 컴포넌트. 사용자 웹(3000)과 운영자 웹(3001)이 같은 스택 |
| UI 런타임   | React                                   | `19.2.x`      | Next 16 요구 버전                                                        |
| 스타일      | Tailwind CSS                            | 4             | 디자인 토큰을 CSS 변수로. 공유 UI는 `@source`로 스캔(아래 함정 7)        |
| 서버 상태   | TanStack Query                          | 5             | 캐시·재시도·로딩 상태를 한 방식으로                                      |
| 폼          | React Hook Form + `@hookform/resolvers` | 7 / 5         | Zod 스키마를 폼 검증에 재사용                                            |
| 공유 UI     | `@oneul-sai/ui`                         | —             | Web/Admin 공용. 소스 그대로 소비(`transpilePackages`)                    |
| 모바일      | Expo SDK / React Native                 | 57 / `0.86.3` | pnpm isolated install 지원(SDK 54+). metro 설정·hoisting 불필요          |
| API 호출    | `@oneul-sai/api-client`                 | —             | contracts 기반 타입 안전 클라이언트. Web/Admin/Mobile 공용               |

### 인프라

| 영역            | 선택                                   | 상태    | 한 줄 이유                                                |
| --------------- | -------------------------------------- | ------- | --------------------------------------------------------- |
| 로컬 인프라     | Docker Compose                         | 사용 중 | Postgres 17 + init 스크립트(논리 DB 5개). Kafka는 profile |
| 컨테이너 이미지 | Dockerfile per service (`turbo prune`) | 사용 중 | 서비스에 필요한 workspace만 담은 독립 이미지              |
| 배포            | Kubernetes (Kustomize)                 | 구조만  | Step 8에서 매니페스트 작성. 배경은 ADR-008                |
| 서드파티 차트   | Helm values                            | 구조만  | 직접 차트를 만들지 않고 values만 관리                     |
| 모니터링        | —                                      | 구조만  | 도구 선택은 결정 예정 (Step 8)                            |

### 에이전트 도구 (개발용, 제품 코드에 들어가지 않음)

규칙은 AGENTS.md 6장 "외부 스킬 · MCP", 설치는 `scripts/setup-agent-tools.sh`. 스킬은 upstream 커밋으로 고정한 사본을 저장소에 커밋한다.

| 도구            | 출처 · 고정 버전                                                | 쓰는 곳                                                                       |
| --------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Taste 스킬      | `Leonxlnx/taste-skill` `3c7017d636` (MIT)                       | 랜딩 · 마케팅만                                                               |
| Emil 스킬 4개   | `emilkowalski/skills` `d16ebe60d0` (MIT)                        | 모든 웹 화면의 모션 · 터치 판단                                               |
| Impeccable 스킬 | `pbakaus/impeccable` `skill-v4.3.1` = `cd12f8660e` (Apache-2.0) | 평가 · 보강 명령, 검사 엔진 `detect` 0.1.5(setup 스크립트가 받아 sha256 확인) |
| Playwright MCP  | `@playwright/mcp@0.0.82` (Apache-2.0)                           | localhost 화면 확인(Codex · 터미널). Windows는 Edge를 쓴다                    |
| Figma MCP       | claude.ai 커넥터(원격, 버전 고정 불가)                          | 거울 파일 · 화면 목업. Starter 읽기 월 20회                                   |

- 사용 통계와 Impeccable 업데이트 확인은 `DO_NOT_TRACK=1` · `IMPECCABLE_NO_UPDATE_CHECK=1`로 끈다. Claude Code는 `.claude/settings.json`의 `env`, 셸 · Codex는 setup 스크립트가 넣는다.
- 고정을 푸는 `npx impeccable` · `npx skills add/update`는 `.claude/settings.json`에서 막아 두었다. Claude Code에서만 걸리는 보조 장치이고, 원칙은 AGENTS.md 6장 규칙이다.
- 스킬 사본의 라이선스 전문은 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
- `@playwright/test`(브라우저 e2e)는 SPEC-003 15절 9번 PR에서 들인다.

## 2. 알려진 함정

각 항목은 "증상 → 원인 → 우리 대응" 순서다. 새 팀원이 같은 곳에서 넘어지지 않게 하는 것이 목적이다.

### 함정 1. Nest CLI가 Node 22.14에서 크래시한다

- 증상: `nest new`, `nest build`가 `ERR_REQUIRE_CYCLE_MODULE`로 죽는다.
- 원인: Nest CLI와 Node 22.14의 ESM/CJS 순환 로딩 충돌.
- 대응: **CLI를 아예 쓰지 않는다.** 빌드는 `tsc -p tsconfig.build.json`, 개발은 `tsc-watch -p tsconfig.build.json --onSuccess "node dist/main.js"`. 새 서비스는 기존 서비스 디렉토리를 복사해 만든다. `nest generate`도 쓰지 않고 파일을 직접 만든다.

### 함정 2. TS 6에서 `@types/*`가 자동으로 포함되지 않는다

- 증상: `process`, `NodeJS.Timeout` 등에 "Cannot find name" 에러. `@types/node`가 설치돼 있어도 난다.
- 원인: TypeScript 6.0은 `node_modules/@types`를 자동으로 끌어오지 않는다.
- 대응: `process`나 Node 전역을 쓰는 패키지는 tsconfig에 `"types": ["node"]`를 명시한다. `packages/logger`, `packages/config`가 그 예다. 새 패키지에서 같은 에러가 나면 이것부터 확인한다.

### 함정 3. pnpm 11은 `package.json`의 `pnpm.*` 설정을 무시한다

- 증상: `package.json`에 `pnpm.onlyBuiltDependencies`를 넣어도 Prisma·esbuild의 postinstall이 돌지 않는다. `.npmrc` 설정도 일부 무시된다.
- 원인: pnpm 11부터 pnpm 설정은 `pnpm-workspace.yaml`이 원천이다.
- 대응: 빌드 스크립트 허용은 `pnpm-workspace.yaml`의 **`allowBuilds`** 맵에 적는다(`prisma`, `@prisma/client`, `@prisma/engines`, `@tailwindcss/oxide`, `esbuild`는 `true`). 새 의존성이 postinstall을 요구하면 여기에 추가한다. 갓 배포된 버전은 `minimumReleaseAge` 정책에 걸릴 수 있어 `minimumReleaseAgeExclude`에 명시한다.

### 함정 4. Prisma 7은 옛 Prisma와 여러 곳이 다르다

- 증상: `.env`를 읽지 않는다. `datasource url`이 없다는 에러. `PrismaClient`를 `new` 했을 때 adapter가 필요하다는 에러. clone 직후 typecheck가 실패한다.
- 원인: Prisma 7은 `.env` 자동 로드를 없앴고, `prisma-client` generator(ESM 전용)와 driver adapter를 요구한다. 생성된 클라이언트는 커밋하지 않는다.
- 대응:
  - 연결 문자열은 `apps/<service>/prisma.config.ts`에서 `import 'dotenv/config'` 뒤 `datasource.url`로 넘긴다. `schema.prisma`의 datasource에는 url을 쓰지 않는다.
  - 런타임은 `@prisma/adapter-pg`: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`.
  - 출력 경로는 `src/generated/prisma`(gitignore). clone 뒤 `pnpm db:generate`를 먼저 돌린다. turbo가 `build`/`dev`/`typecheck` 앞에 자동으로 연결해 두었다.
  - 모델이 0개인 스키마에서도 generate가 정상 동작한다(검증됨).

### 함정 5. http-proxy-middleware는 v3를 유지한다

- 증상: v4로 올리면 Node 22.14에서 설치·실행이 막힌다.
- 원인: v4는 ESM 전용이고 Node `>=22.15`를 요구한다. 개발 머신과 CI 하한이 22.14/22.12다.
- 대응: `^3.0.7` 유지. API는 v3와 v4가 같으므로 Node를 22.15 이상으로 올린 뒤에는 코드 변경 없이 v4로 갈 수 있다.

### 함정 6. NestJS ESM 플레이버의 import 규칙

- 증상: 런타임에 `ERR_MODULE_NOT_FOUND`. 타입체크는 통과한다.
- 원인: `"type": "module"`이므로 상대 import에 확장자가 필요하다.
- 대응: 상대 import는 `./app.module.js`처럼 **`.js` 확장자**를 붙인다(소스는 `.ts`여도). `env.ts`는 dotenv side effect 때문에 `main.ts`에서 가장 먼저 import한다.

### 함정 7. Next 16과 Tailwind 4의 달라진 점

- `next lint`가 없다. 각 앱의 `lint` 스크립트는 `eslint`를 직접 부른다.
- Turbopack이 기본이다. webpack 설정을 넣지 않는다.
- workspace 패키지는 대부분 `transpilePackages`가 필요 없다. 예외는 소스를 그대로 소비하는 `@oneul-sai/ui`.
- Tailwind 4는 클래스 스캔 범위를 CSS에서 지정한다. web/admin의 `globals.css`에 `@source "../../../packages/ui/src"`가 있어야 공유 UI의 클래스가 빌드에 포함된다.

### 함정 8. Expo 57과 pnpm

- Expo SDK 54부터 pnpm isolated install을 지원한다. `node-linker=hoisted`를 켜지 않는다. `metro.config.js`도 필요 없다.
- mobile의 React 버전(`19.2.3`)은 Expo가 고정한다. web(`19.2.8`)과 패치 버전이 달라도 정상이다. 억지로 맞추지 않는다.

### 함정 9. scrypt의 `maxmem`과 libuv 스레드풀

- 증상: `crypto.scrypt`가 `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`(memory limit exceeded)로 실패한다. 로그인이 몰리면 가입 · refresh · DB 호출까지 함께 느려진다.
- 원인: SPEC-001 12절의 파라미터(N=2^17, r=8)는 호출당 128MiB를 쓰는데 Node `maxmem` 기본값은 32MiB다. scrypt는 libuv 스레드풀(기본 4)에서 돌아 다른 비동기 작업과 스레드를 나눠 쓴다.
- 대응: `apps/member-service/src/auth/password.ts`가 `maxmem: 256MiB`를 명시한다. 파라미터를 올리면 `maxmem`도 같이 본다. 서비스 프로세스에는 `UV_THREADPOOL_SIZE=8`(scrypt 동시 실행 상한 4 + DB 드라이버 여유)을 권고한다 — Node가 시작할 때 읽는 변수라 `.env`가 아니라 실행 환경에서 준다. CI의 `integration` 잡에는 이미 설정돼 있다.

### 함정 10. 공유 Nest 패키지는 NestJS를 peerDependencies로 둔다

- 증상: 앱이 부팅하면서 `RolesGuard`의 의존성(`Reflector`)을 찾지 못해 실패하거나, 필터의 `instanceof HttpException`이 거짓이 되어 모든 에러가 500이 된다.
- 원인: `@oneul-sai/service-kit`이 `@nestjs/common` · `@nestjs/core`를 자기 `dependencies`로 따로 가지면 앱과 kit이 서로 다른 Nest 인스턴스를 로드한다. 그러면 kit의 `Reflector` · `HttpException`은 앱의 것과 다른 클래스다.
- 대응: `@nestjs/common` · `@nestjs/core` · `reflect-metadata` · `rxjs`는 kit의 `peerDependencies`(+ 테스트용 `devDependencies`)에 앱과 **같은 버전 범위**로 둔다. Nest 메이저를 올릴 때 kit의 범위도 함께 올린다. 확인: 앱과 kit의 `node_modules/@nestjs/core`가 같은 `.pnpm` 경로를 가리키는지(`cd <pkg>/node_modules/@nestjs/core && pwd -P`). ADR-010.

### 함정 11. `partialIndexes`의 부분 유니크는 보통 복합 유니크처럼 생성된다

- 증상: `Application`의 부분 유니크(`@@unique([scheduleId, memberId], where: raw("\"status\" <> 'CANCELLED'"))`)를 선언하면 `findUnique({ where: { scheduleId_memberId } })` · `update` · `upsert`가 타입 검사를 통과한다. 그런데 같은 쌍에 취소된 행이 여럿일 수 있어, 이 선택자는 취소된 행을 읽거나 바꿀 수 있다.
- 원인: Prisma 7.10 `partialIndexes` 미리보기의 생성 클라이언트는 `where` 조건을 모르고 복합 유니크 선택자(`ApplicationWhereUniqueInput.scheduleId_memberId`)를 만든다.
- 대응: 이 선택자를 쓰지 않는다. 활성 신청은 `findFirst`에 `ACTIVE_APPLICATION_WHERE`(`status <> 'CANCELLED'`)를 붙여 찾는다(SPEC-003 9 · 10절). 코드 검색으로 쓰는 곳이 없는지 본다: `git grep scheduleId_memberId -- apps/event-service/src ':!**/generated/**'`. 미리보기를 끄거나 버전을 올릴 때 `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma`가 비어 있는지 확인한다(인덱스를 Prisma가 관리한다).

## 3. 업그레이드 시 확인할 것

### 절차

1. 별도 브랜치에서 한 번에 한 영역만 올린다. 커밋은 `chore(deps): ...`.
2. `pnpm install` → `pnpm db:generate` → `pnpm lint && pnpm typecheck && pnpm test && pnpm build`가 모두 초록인지 확인한다.
3. 로컬에서 `docker compose up -d` 뒤 서비스 하나를 띄워 `/health`와 `/docs`를 열어 본다.
4. 이 문서의 1절 표와 2절 함정을 갱신한다. 함정이 사라졌으면 "해소됨(날짜)"으로 남긴다.
5. 되돌리기 어려운 변경(ORM 교체, 프레임워크 메이저, 런타임 교체)은 ADR을 쓴다.

### 영역별 확인표

| 올리는 것                | 먼저 확인할 것                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node                     | Nest CLI 크래시(함정 1)가 해소됐는지. `>=22.15`면 http-proxy-middleware v4 전환 가능(함정 5). Dockerfile 베이스 이미지와 CI `node-version`도 함께 |
| TypeScript               | typescript-eslint가 그 버전을 지원하는지. TS 7 전환은 도구 지원 확인 뒤 ADR로 결정                                                                |
| pnpm                     | `pnpm-workspace.yaml`의 `allowBuilds`·`minimumReleaseAge*` 스키마 변경 여부. `packageManager` 필드 갱신                                           |
| Turborepo                | `turbo.json` 태스크 정의 형식 변경. `db:generate` 의존 연결이 유지되는지                                                                          |
| NestJS / @nestjs/swagger | 두 패키지 메이저를 같이 올린다. ESM 플레이버 유지. vitest 호환. `@oneul-sai/service-kit`의 peerDependencies 범위도 함께(함정 10)                  |
| Prisma                   | generator 이름과 출력 경로, adapter 패키지 버전을 `prisma`·`@prisma/client`·`@prisma/adapter-pg` 셋 다 같은 버전으로                              |
| Next.js / React          | `eslint-config-next`를 같은 버전으로. Turbopack 비호환 설정 여부. `@oneul-sai/ui` transpile 확인                                                  |
| Tailwind                 | `@source` 문법과 `@tailwindcss/postcss` 플러그인 변경 여부                                                                                        |
| Expo SDK                 | React Native와 React 버전이 함께 바뀐다. `expo-doctor`로 호환 확인                                                                                |
| ESLint / Prettier        | flat config 형식, `@oneul-sai/eslint-config` 프리셋의 플러그인 호환                                                                               |
| PostgreSQL               | Docker 이미지 태그, init 스크립트, Prisma 지원 범위. 데이터 볼륨은 `docker compose down -v` 뒤 재생성                                             |
