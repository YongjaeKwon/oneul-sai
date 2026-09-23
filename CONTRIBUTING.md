# 오늘사이에 기여하기

오늘사이(ONULSAI) 코드베이스에서 함께 일하기 위한 가장 짧은 안내입니다.
이 문서는 "무엇을 지키고, 어디를 보면 되는지"만 알려줍니다. 자세한 규칙은 `docs/guides/`에 있습니다.

## 5분 로컬 세팅

요구 환경: **Node.js 22.12 이상**, **pnpm 11**, **Docker Desktop**.

```bash
docker compose up -d   # PostgreSQL 17 + 서비스별 논리 DB 5개
pnpm install           # 의존성 설치 (build 스크립트 허용 프롬프트가 뜨면 확인 후 y)
pnpm db:generate       # Prisma Client 생성 — clone 직후 반드시 한 번
pnpm dev               # 모든 앱/서비스를 dev 모드로 실행
```

확인: `http://localhost:4000/health`가 `"status":"ok"`를 돌려주면 성공입니다.
처음이라면 [온보딩 가이드](docs/guides/onboarding.md)를 순서대로 따라가세요.

## 브랜치

- `main`은 항상 배포 가능한 상태로 둡니다. `main`에 직접 push하지 않습니다.
- 작업 브랜치 이름은 `<type>/<step>-<topic>` 형식입니다.
  - 예) `feat/step1-auth`, `fix/gateway-request-id`, `docs/step0-guides`
- 자세히: [브랜치와 커밋](docs/guides/branching-and-commits.md)

## 커밋

**Conventional Commits** 형식에 **한국어 제목**을 씁니다. 실제로 쓰고 있는 예시입니다.

```
chore(repo): pnpm workspace + Turborepo 루트 구성
feat(services): API Gateway + NestJS 서비스 5개 뼈대
docs: README, 아키텍처 개요, ADR 8건, API/DB/이벤트 가이드
```

- 제목은 50자 안에서. 본문에는 "무엇"보다 **"왜"**를 씁니다.
- 커밋은 **의미 단위**로 쪼갭니다. 하나의 커밋 = 하나의 이야기.
- 자세히: [브랜치와 커밋](docs/guides/branching-and-commits.md)

## Pull Request

- **작게** 만듭니다. 한 PR = 한 Step의 한 조각.
- 제목은 커밋 규약과 같은 형식. 본문은 [PR 템플릿](.github/PULL_REQUEST_TEMPLATE.md)을 채웁니다.
- 리뷰어 1명 이상. 초기(1인 개발) 동안은 **셀프 리뷰를 허용**합니다. 단, 템플릿의 체크리스트는 반드시 채웁니다.
- CI(lint · typecheck · test · build)가 모두 통과해야 머지합니다.
- 자세히: [Pull Request 규칙](docs/guides/pull-requests.md)

## Definition of Done

"끝났다"는 아래 다섯 줄이 모두 참일 때입니다.

| 항목   | 기준                                                                        |
| ------ | --------------------------------------------------------------------------- |
| 동작   | 로컬에서 `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` 모두 통과 |
| 경계   | 서비스 경계 · DB 소유권 · 공유 패키지 규칙을 위반하지 않음                  |
| 문서   | 변경 유형에 맞는 문서를 **같은 PR**에서 갱신                                |
| 리뷰   | PR 템플릿 체크리스트 완료, 리뷰 승인                                        |
| 상황판 | 해당 Step의 진행 상태 갱신                                                  |

이 표는 요약입니다. PR 단위 원천은 [Pull Request 규칙 7절](docs/guides/pull-requests.md#7-definition-of-done),
기능(Step) 단위 원천은 [문서 지도 4절](docs/README.md#4-한-기능이-끝났다의-정의-definition-of-done)입니다.

## 문서도 코드처럼

코드가 바뀌면 문서도 같은 PR에서 바뀝니다. 어떤 변경에 어떤 문서를 고치는지는
[문서 갱신 규칙](docs/guides/documentation-rules.md)에 표로 정리되어 있습니다.
문서 전체 지도는 [docs/README.md](docs/README.md)를 보세요.

## 지켜야 할 원칙 (요약)

1. **MSA 경계 유지** — 각 서비스는 자기 도메인만 소유합니다.
2. **Database per Service** — 다른 서비스의 DB에 접근하지 않습니다.
3. **REST(동기) / Kafka(비동기)** 를 구분합니다.
4. **공유 패키지에 비즈니스 로직 금지** — 서비스 간에는 Contract만 공유합니다.
5. **TypeScript strict** — 모든 패키지에서.
6. **불필요한 추상화 · 기술 과시용 구현 금지** — 모든 기술 선택은 서비스 요구에서 출발합니다.
7. **설계서 먼저** — 비즈니스 기능은 [설계서(SPEC)](docs/specs/README.md)를 먼저 쓰고 구현합니다.

각 결정의 배경은 [ADR](docs/adr/README.md)에 있습니다.

## AI 에이전트와 함께 일할 때

Claude Code 같은 AI 코딩 에이전트도 위 규칙을 똑같이 따릅니다.
에이전트용 작업 규칙은 [AGENTS.md](AGENTS.md)에 있으며(Codex가 읽고, Claude Code는 CLAUDE.md가 불러옵니다), 사람이 읽어도 그대로 유용합니다.
