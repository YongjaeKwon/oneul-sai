# 온보딩 — 새 개발자 첫날 체크리스트

오늘사이 코드베이스에 처음 합류한 개발자를 위한 문서입니다.
위에서부터 순서대로 따라가면 첫날 안에 로컬 환경이 돌아가고, 무엇을 읽어야 하는지 알게 됩니다.

- 상태: 확정
- 최종 갱신: 2026-09-22

> 막히면 이 문서의 [4. 자주 겪는 문제](#4-자주-겪는-문제)를 먼저 보세요.
> 거기에도 없으면 [버그 이슈](../../.github/ISSUE_TEMPLATE/bug.md) 형식으로 남겨 주세요. 다음 사람을 위해 이 문서에 추가합니다.

---

## 1. 요구 환경

| 항목           | 버전                         | 확인 명령                | 메모                                                                                                              |
| -------------- | ---------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Node.js        | **22.12 이상** (22 LTS 권장) | `node -v`                | 루트 `.node-version`(내용 `22`)을 fnm/nvm 등 버전 관리자가 읽습니다                                               |
| pnpm           | **11**                       | `pnpm -v`                | `corepack enable` 후 루트에서 `pnpm -v`를 치면 `package.json`의 `packageManager` 버전이 자동 적용됩니다           |
| Docker Desktop | 최신                         | `docker compose version` | PostgreSQL(필수), Kafka(선택) 로컬 실행용                                                                         |
| Git            | 2.40 이상                    | `git --version`          | Windows는 Git Bash 포함 설치 권장                                                                                 |
| VS Code        | 최신                         | —                        | 루트 `.vscode/extensions.json`의 권장 확장을 모두 설치하세요 (ESLint, Prettier, Prisma, Tailwind CSS, Expo Tools) |

- 운영체제는 Windows / macOS / Linux 모두 지원합니다. 줄바꿈은 `.gitattributes`와 `.editorconfig`가 LF로 통일합니다.
- 모바일 앱(Expo)을 기기에서 보려면 스마트폰에 **Expo Go** 앱이 필요합니다. 첫날에는 선택 사항입니다.

## 2. 설치 순서

```bash
# 1) 저장소 받기
git clone <저장소 URL> oneul-sai
cd oneul-sai

# 2) Node / pnpm 확인
node -v            # v22.x
corepack enable    # pnpm 11이 자동으로 준비됩니다
pnpm -v            # 11.x

# 3) 로컬 인프라 (Docker Desktop이 켜져 있어야 합니다)
docker compose up -d                  # PostgreSQL 17 + 논리 DB 5개 자동 생성
# docker compose --profile kafka up -d  # Kafka까지 필요할 때만 (현재는 선택)

# 4) 의존성 설치
pnpm install       # "build 스크립트 허용" 프롬프트가 뜨면 목록을 확인하고 y

# 5) Prisma Client 생성 — clone 직후 한 번은 꼭
pnpm db:generate

# 6) 전체 실행
pnpm dev
```

- 환경 변수는 각 앱/서비스의 `.env.example`을 `.env`(Next.js는 `.env.local`)로 복사해 사용합니다.
  로컬 기본값이 코드에 들어 있어 **복사하지 않아도 일단 실행은 됩니다.** 값을 바꿀 때만 복사하세요.
- `.env`는 절대 커밋하지 않습니다. `.gitignore`가 막고 있지만, `git status`에서 한 번 더 확인하는 습관을 권합니다.

## 3. 확인 커맨드

모두 켜졌는지 아래 주소로 확인합니다. 브라우저로 열어도 되고, 터미널에서는 `curl`을 씁니다.

> Windows PowerShell에서 `curl`은 `Invoke-WebRequest`의 별칭입니다. `curl.exe http://localhost:4000/health` 처럼 `.exe`를 붙이거나 Git Bash를 사용하세요.

| 대상                 | 포트 | Health                         | Swagger                      | 기대 응답                                                      |
| -------------------- | ---- | ------------------------------ | ---------------------------- | -------------------------------------------------------------- |
| API Gateway          | 4000 | `http://localhost:4000/health` | `http://localhost:4000/docs` | `status: "ok"`, `service: "api-gateway"`                       |
| member-service       | 4001 | `http://localhost:4001/health` | `http://localhost:4001/docs` | `status: "ok"`, `database: "up"`                               |
| event-service        | 4002 | `http://localhost:4002/health` | `http://localhost:4002/docs` | 같음                                                           |
| matching-service     | 4003 | `http://localhost:4003/health` | `http://localhost:4003/docs` | 같음                                                           |
| notification-service | 4004 | `http://localhost:4004/health` | `http://localhost:4004/docs` | 같음                                                           |
| payment-service      | 4005 | `http://localhost:4005/health` | `http://localhost:4005/docs` | 같음                                                           |
| Web (사용자)         | 3000 | —                              | —                            | `http://localhost:3000` 랜딩 화면                              |
| Admin (운영자)       | 3001 | —                              | —                            | `http://localhost:3001` 관리자 홈                              |
| Mobile (Expo)        | —    | —                              | —                            | `pnpm --filter @oneul-sai/mobile start` 후 QR을 Expo Go로 스캔 |

- 서비스 `/health`에서 `database: "down"`, `status: "degraded"`가 나오면 Postgres가 안 떠 있다는 뜻입니다. 아래 표를 보세요.
- 한 개만 띄우려면 `pnpm --filter @oneul-sai/member-service dev` 처럼 `--filter`를 씁니다.
- 마지막 확인: `pnpm typecheck && pnpm lint && pnpm test` 가 초록이면 환경 세팅은 끝입니다.

## 4. 자주 겪는 문제

증상 → 해결만 빠르게 적었습니다. **원인의 자세한 설명과 우리가 그렇게 대응한 이유**는 [기술 스택 문서의 "알려진 함정"](../architecture/tech-stack.md#2-알려진-함정)에 있습니다.

| 증상                                                                 | 원인                                                                                                          | 해결                                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/health`가 `database: "down"` 또는 `ECONNREFUSED ...:5432`          | Docker Desktop이 꺼져 있거나 Postgres 컨테이너가 안 떠 있음                                                   | Docker Desktop 실행 → `docker compose up -d` → `docker ps`로 `oneul-sai-postgres` 확인                                              |
| `nest` 명령이 없다 / `nest g ...`가 안 된다                          | 이 프로젝트는 **Nest CLI를 쓰지 않습니다.** Node 22.14에서 CLI가 크래시하는 문제로 `tsc` + `tsc-watch`만 사용 | 파일은 손으로 만들거나 기존 서비스 구조를 복사합니다. `dev`/`build` 스크립트는 각 서비스 `package.json` 참고                        |
| `Cannot find name 'process'` / `Buffer` 타입 오류                    | TypeScript 6는 `@types/*`를 **자동 포함하지 않습니다**                                                        | 해당 패키지 `tsconfig.json`에 `"types": ["node"]` (vitest 쓰는 곳은 `["node", "vitest/globals"]`)                                   |
| `pnpm install` 중 "Ignored build scripts" 경고 또는 허용 프롬프트    | pnpm 11은 의존성의 build 스크립트를 **허용 목록**(`pnpm-workspace.yaml`의 `allowBuilds`)으로만 실행           | 프롬프트는 목록을 읽고 `y`. 새 의존성이 빌드 스크립트를 가지면 팀과 상의 후 `allowBuilds`에 추가하고 PR에 이유를 남깁니다           |
| `Cannot find module '../generated/prisma/client.js'` / 타입체크 실패 | `prisma generate`를 안 돌려서 `src/generated/`가 비어 있음 (gitignore 대상)                                   | `pnpm db:generate`. turbo가 `dev`/`build`/`typecheck` 전에 자동 실행하지만, **VS Code의 빨간 줄**은 직접 한 번 돌려야 사라집니다    |
| Prisma CLI가 `DATABASE_URL`을 못 찾는다                              | Prisma 7은 `.env`를 자동 로드하지 않음                                                                        | 각 서비스 `prisma.config.ts`가 `dotenv`로 로드합니다. 서비스 디렉토리에서 실행하거나 `pnpm --filter <service> db:generate`를 쓰세요 |
| `EADDRINUSE: address already in use :::4001`                         | 같은 포트를 다른 프로세스가 사용 중                                                                           | 이전 `pnpm dev` 프로세스를 종료하거나, 해당 서비스 `.env`의 `PORT`를 바꿉니다                                                       |
| Windows에서 `LF will be replaced by CRLF` 경고                       | Git 줄바꿈 자동 변환                                                                                          | `.gitattributes`가 저장소 쪽을 LF로 고정하므로 무해합니다. 경고를 없애려면 `git config core.autocrlf false`                         |
| Next.js에서 환경 변수가 `undefined`                                  | Next.js는 `.env.local`을 읽고, 클라이언트 노출 변수는 `NEXT_PUBLIC_` 접두사 필요                              | `apps/web/.env.example` → `.env.local` 복사 후 dev 서버 재시작                                                                      |

## 5. 읽을 문서 순서

첫날에 전부 읽을 필요는 없습니다. 아래 순서로 **한 단계씩** 읽으세요.

1. **개요 소개서** — [docs/overview/project-overview.md](../overview/project-overview.md): 오늘사이가 어떤 서비스인지, 참가자와 운영자의 여정, 네 가지 개념(TODAY · ONE MORE · AFTER · NEXT). 이어서 [용어 사전](../overview/glossary.md)을 한 번 훑어 두면 이후 문서가 쉽게 읽힙니다.
2. **아키텍처 개요** — [docs/architecture/overview.md](../architecture/overview.md): 서비스 6개와 포트, 통신 원칙, 현재 구현 범위. 이어서 [기술 스택](../architecture/tech-stack.md)에서 버전과 "알려진 함정"을 확인합니다.
3. **ADR** — [docs/adr/README.md](../adr/README.md): 왜 이렇게 나눴는지. ADR-004(서비스 경계)와 ADR-007(DB per Service)을 먼저 읽으면 됩니다.
4. **해당 Step 설계서** — [docs/specs/README.md](../specs/README.md): 설계서 운영 방식과 Step별 예약 목록(SPEC-001~008). 내가 맡은 Step의 설계서가 없으면 그 Step은 아직 설계 전이고, 설계서 작성이 첫 일입니다.
5. **규칙 문서** — [API 규칙](../api/README.md), [데이터베이스](../database/README.md), [이벤트](../events/README.md).
6. **협업 가이드** — [브랜치와 커밋](./branching-and-commits.md), [Pull Request](./pull-requests.md), [문서 갱신 규칙](./documentation-rules.md).
7. **UI 작업을 한다면** — [디자인 파운데이션](../design/design-foundation.md)과 [브랜드 원본 자산](../design/brand/README.md): 브랜드, 색, 글꼴, 컴포넌트, 문구 톤. 그리고 [기능 소개서](../overview/features/README.md)로 화면이 사용자에게 어떻게 보여야 하는지 확인합니다.

전체 지도는 [docs/README.md](../README.md)에 있습니다.

## 6. 첫 기여 추천

작은 것부터 시작하세요. 규칙과 흐름에 익숙해지는 것이 목적입니다.

- 이 문서에서 틀린 곳, 빠진 "자주 겪는 문제"를 고치는 PR
- 앱/패키지 README의 오타나 오래된 설명 수정
- 맡은 Step의 설계서 초안(`docs/specs/`) — 코드보다 설계서가 먼저입니다

## 7. 첫날 체크리스트

- [ ] Node 22, pnpm 11, Docker Desktop 설치 확인
- [ ] `docker compose up -d` → `docker ps`에 Postgres 컨테이너 보임
- [ ] `pnpm install` / `pnpm db:generate` 성공
- [ ] `pnpm dev` 후 Gateway와 서비스 5개의 `/health` 모두 `ok`
- [ ] Web(3000) / Admin(3001) 화면 열림
- [ ] `pnpm typecheck && pnpm lint && pnpm test` 통과
- [ ] VS Code 권장 확장 설치, 저장 시 Prettier 포맷 동작 확인
- [ ] 개요 소개서와 아키텍처 개요 읽음
- [ ] [CONTRIBUTING.md](../../CONTRIBUTING.md)와 [CLAUDE.md](../../CLAUDE.md) 읽음
- [ ] 진행 상황판 접근 확인 (링크는 [문서 갱신 규칙](./documentation-rules.md#6-상황판-갱신-시점) 참고)
- [ ] 첫 작업 브랜치 생성 (`<type>/<step>-<topic>`)

## 선택: AI 에이전트 도구 (Claude Code · Codex)

규칙(`AGENTS.md`, `CLAUDE.md`)과 프로젝트 스킬(`.claude/skills/`, `.agents/skills/`)은 저장소에 들어 있어 clone만 하면 된다. Ponytail · Graphify 같은 개인 도구와 HyperFrames 사용 통계 끄기는 PC마다 한 번 실행한다:

```bash
bash scripts/setup-agent-tools.sh
```

Windows PowerShell에서는 `bash`가 WSL용 `bash.exe`로 잡혀 실패할 수 있다(`execvpe(/bin/bash) failed`). Git Bash 창에서 위 명령을 쓰거나, PowerShell에서는 경로를 지정한다:

```powershell
& "C:\Program Files\Gitinash.exe" scripts/setup-agent-tools.sh
```

처음 여는 PC에서는 Claude Code와 Codex 모두 이 폴더를 신뢰해야 저장소 설정(`.claude/settings.json`)이 적용된다. 외부 스킬 사용 규칙은 CLAUDE.md 6장 "외부 스킬".
