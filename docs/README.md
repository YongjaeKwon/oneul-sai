# 오늘사이 문서 지도

이 문서는 오늘사이 저장소의 모든 문서를 한눈에 찾는 지도다. 어떤 문서가 어디에 있고, 누가 읽고, 언제 고치고, 무엇이 원천(source of truth)인지 정한다.

원칙은 하나다. **문서는 코드와 함께 간다.** 코드가 바뀌면 관련 문서도 같은 PR에서 바뀐다. 어떤 문서를 고쳐야 하는지는 [5. 판단표](#5-pr에서-어떤-문서를-고치나--판단표)를 따른다.

- 상태: 확정
- 최종 갱신: 2026-09-22

## 1. 처음 오셨다면

| 나는                          | 이 순서로 읽는다                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 비개발자(운영·마케팅·디자인)  | [개요 소개서](./overview/project-overview.md) → [용어 사전](./overview/glossary.md) → [기능 소개서](./overview/features/README.md)                                      |
| 새로 합류한 개발자            | 루트 [README](../README.md)로 설치 → [온보딩 가이드](./guides/onboarding.md)를 따라간다. 읽을 문서 순서는 온보딩 가이드 5절이 정한다                                    |
| 기능 하나를 맡은 개발자       | 해당 [기능 설계서](./specs/README.md) → [API 규칙](./api/README.md) → [데이터베이스](./database/README.md) → [이벤트](./events/README.md) → 관련 [ADR](./adr/README.md) |
| 화면을 만드는 개발자·디자이너 | [디자인 파운데이션](./design/design-foundation.md) → 기능 소개서 → 설계서의 "사용자 흐름" 절                                                                            |

## 2. 문서 종류

| 문서 종류         | 위치                                                                                                                                                                                                                            | 누가 읽나                   | 언제 갱신하나                                                         | 원천(source of truth)                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 개요 소개서       | [docs/overview/project-overview.md](./overview/project-overview.md)                                                                                                                                                             | 모두. 비개발자 포함         | 서비스 방향·운영 방식이 바뀔 때, Step이 끝날 때                       | 이 문서. 근거는 팜플렛과 운영 방침. 5장 로드맵 표는 Step 번호·이름·상태의 원천                                            |
| 용어 사전         | [docs/overview/glossary.md](./overview/glossary.md)                                                                                                                                                                             | 모두                        | 코드나 문서에 새 용어가 등장할 때                                     | 이 문서. 코드 식별자는 용어 사전을 따른다                                                                                 |
| 기능 소개서       | [docs/overview/features/](./overview/features/README.md)                                                                                                                                                                        | 모두. 특히 운영자·CS        | 설계서 확정 시 초안, 배포 시 확정, 규칙·문구가 바뀔 때                | 확정된 설계서와 실제 화면                                                                                                 |
| 기능 설계서       | [docs/specs/](./specs/README.md)                                                                                                                                                                                                | 개발자, 리뷰어              | Step 시작 시 작성, 리뷰 후 확정, 구현 후 "실제 구현과의 차이" 절 갱신 | 구현 전에는 이 문서. 구현 후에는 코드(문서를 코드에 맞춘다)                                                               |
| 기술 문서         | [docs/architecture/](./architecture/overview.md)                                                                                                                                                                                | 개발자                      | 서비스 경계·포트·통신 방식·기술 스택·버전이 바뀔 때                   | overview: 이 문서. tech-stack: `package.json`, `pnpm-workspace.yaml`, tsconfig                                            |
| API 규칙          | [docs/api/README.md](./api/README.md)                                                                                                                                                                                           | 백엔드·프론트 개발자        | 엔드포인트 추가·변경·삭제, 규약 변경                                  | 각 서비스 Swagger(`http://localhost:<port>/docs`). 이 문서는 규약과 인덱스                                                |
| 데이터베이스      | [docs/database/README.md](./database/README.md)                                                                                                                                                                                 | 백엔드 개발자               | Prisma 스키마·마이그레이션 변경                                       | `apps/<service>/prisma/schema.prisma`                                                                                     |
| 이벤트            | [docs/events/README.md](./events/README.md)                                                                                                                                                                                     | 백엔드 개발자               | 토픽 추가, payload 버전 변경                                          | `packages/contracts`의 이벤트 타입                                                                                        |
| ADR               | [docs/adr/](./adr/README.md)                                                                                                                                                                                                    | 개발자, 리뷰어              | 되돌리기 어려운 결정을 내리는 시점                                    | 이 문서. 뒤집히면 새 ADR로 대체하고 옛 문서는 상태만 바꾼다                                                               |
| 디자인 파운데이션 | [docs/design/design-foundation.md](./design/design-foundation.md)                                                                                                                                                               | 프론트 개발자, 디자이너     | 브랜드·색·폰트·컴포넌트 규칙이 바뀔 때                                | 이 문서(디자인 담당이 작성·관리)                                                                                          |
| 협업 가이드       | `docs/guides/` — [온보딩](./guides/onboarding.md), [브랜치와 커밋](./guides/branching-and-commits.md), [PR](./guides/pull-requests.md), [코드 리뷰](./guides/code-review.md), [문서 갱신 규칙](./guides/documentation-rules.md) | 모든 개발자                 | 브랜치·커밋·리뷰·문서 갱신 절차가 바뀔 때                             | 이 문서. 문서 갱신 규칙은 판단표(5절)의 원천                                                                              |
| 규칙 요약         | 루트 [CONTRIBUTING.md](../CONTRIBUTING.md)(사람), [AGENTS.md](../AGENTS.md)(AI 에이전트 — Codex가 읽고 Claude Code는 [CLAUDE.md](../CLAUDE.md)가 불러옴)                                                                        | 모든 개발자, AI 에이전트    | 협업 가이드가 바뀔 때 함께                                            | `docs/guides/`. 요약이 어긋나면 가이드를 따른다                                                                           |
| 진행 상황판       | [아티팩트](https://claude.ai/artifact/M3foVY7pn38tXo5QguZvXa)                                                                                                                                                                   | 모두                        | Step 시작·종료 시                                                     | 저장소 밖 아티팩트. 문서와 어긋나면 문서가 원천([문서 갱신 규칙 6절](./guides/documentation-rules.md#6-상황판-갱신-시점)) |
| 앱·패키지 README  | `apps/*/README.md`, `packages/*/README.md`                                                                                                                                                                                      | 그 디렉토리를 만지는 개발자 | 실행 방법·환경 변수·구조가 바뀔 때                                    | 해당 디렉토리의 코드                                                                                                      |

## 3. 폴더 구조

```
docs/
├── README.md                 # 이 문서. 문서 지도
├── overview/                 # 비개발자도 읽는 소개 문서
│   ├── project-overview.md   #   개요 소개서
│   ├── glossary.md           #   용어 사전
│   └── features/             #   기능 소개서 (기능 하나당 1문서, 사용자 관점)
├── specs/                    # 기능 설계서 (SPEC-001-... , 구현 전 작성)
├── architecture/             # 구조, 기술 스택, 버전 결정
├── api/                      # API 규약과 엔드포인트 인덱스
├── database/                 # DB 소유권, Prisma 워크플로우, 마이그레이션
├── events/                   # Kafka 이벤트·토픽 규약
├── adr/                      # 되돌리기 어려운 결정 기록
├── design/                   # 브랜드·UI 디자인 파운데이션
└── guides/                   # 협업 가이드
    ├── onboarding.md         #   새 팀원 온보딩
    ├── branching-and-commits.md  # 브랜치·커밋 규약
    ├── pull-requests.md      #   PR·리뷰 절차
    ├── code-review.md        #   리뷰 코멘트 · AI 리뷰 · 셀프 리뷰 방식
    └── documentation-rules.md    # 문서 갱신 규칙 (판단표의 원천)
```

## 4. "한 기능이 끝났다"의 정의 (Definition of Done)

기능 하나(보통 로드맵 Step 하나)는 아래를 모두 만족했을 때 끝난 것으로 본다. 코드 항목과 문서 항목은 같은 무게다.

### 코드

- [ ] 설계서에 적힌 범위가 구현됐다. 범위 밖은 "미결 사항"이나 다음 Step으로 넘겼다.
- [ ] 단위 테스트가 있고, 동시성·실패 경로 중 설계서가 지목한 것은 테스트로 덮었다.
- [ ] CI(lint / typecheck / test / build)가 초록이다.
- [ ] 새 환경 변수는 루트와 해당 서비스의 `.env.example`에 들어갔다.

### 문서

- [ ] **기능 설계서**: "17. 실제 구현과의 차이" 절을 채우고, "16. 미결 사항" 중 해결된 것을 정리했다. (상태는 리뷰 통과 시점에 이미 "확정"이다. [설계서 생명주기](./specs/README.md#3-생명주기))
- [ ] **API 문서**: Swagger 데코레이터를 달고, `docs/api/README.md`의 엔드포인트 인덱스 표를 갱신했다. `packages/contracts`와 `packages/api-client`도 맞췄다.
- [ ] **데이터베이스**: 스키마가 바뀌었다면 마이그레이션을 만들고 `docs/database/README.md`를 갱신했다.
- [ ] **이벤트**: 토픽을 추가·변경했다면 `docs/events/README.md`와 `packages/contracts`를 갱신했다.
- [ ] **기능 소개서**: 사용자 관점 문서를 쓰거나 갱신했다. 규칙 문구는 팜플렛 문구를 그대로 쓴다.
- [ ] **용어 사전**: 새 용어가 생겼다면 추가했다.
- [ ] **ADR**: 되돌리기 어려운 결정이 있었다면 기록했다.
- [ ] **현재 상태**: [개요 소개서 5장](./overview/project-overview.md#5-지금-어디까지-왔나) 로드맵 표의 상태(원천), `AGENTS.md` 5절 로드맵 표, 루트 README의 "현재 상태와 Roadmap", `docs/architecture/overview.md`의 "현재 구현 범위" 표, 진행 상황판을 갱신했다.

## 5. PR에서 어떤 문서를 고치나 — 판단표

PR을 열기 전에 내 변경이 어느 줄에 해당하는지 찾는다. 여러 줄에 해당하면 모두 고친다.
이 표는 [문서 갱신 규칙 2절](./guides/documentation-rules.md#2-변경-유형별-갱신-표)의 **요약**이다. 두 표가 다르면 문서 갱신 규칙이 원천이고, 이 표를 거기에 맞춘다.

| 코드 변경 유형                                 | 갱신할 문서                                                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 엔드포인트 추가·변경·삭제, 요청/응답 형태 변경 | 컨트롤러 Swagger 데코레이터 → `docs/api/README.md` 인덱스 표 → `packages/contracts` → `packages/api-client` → 관련 설계서 "API 변경" 절 |
| Gateway 라우팅 prefix 추가·변경                | `docs/api/README.md` 라우팅 테이블, `docs/architecture/overview.md`                                                                     |
| Prisma 스키마·마이그레이션                     | `docs/database/README.md`, 관련 설계서 "DB 변경" 절                                                                                     |
| Kafka 이벤트 발행·구독 추가, payload 변경      | `docs/events/README.md`, `packages/contracts`, 관련 설계서 "이벤트" 절                                                                  |
| 서비스 경계·책임·포트 변경                     | `docs/architecture/overview.md`, 루트 README, 해당 서비스 README. 경계 변경은 ADR도                                                     |
| 라이브러리 메이저 업그레이드, 새 기술 도입     | `docs/architecture/tech-stack.md`. 되돌리기 어렵다면 ADR                                                                                |
| 에이전트 스킬 · MCP 도입 · 버전 올림           | `scripts/setup-agent-tools.sh` 머리말, `docs/architecture/tech-stack.md` 에이전트 도구 표, `THIRD_PARTY_NOTICES.md`                     |
| 되돌리기 어려운 구조 결정                      | `docs/adr/` 새 ADR + 인덱스 표                                                                                                          |
| 사용자에게 보이는 규칙·화면·문구 변경          | `docs/overview/features/` 해당 문서, 용어 사전                                                                                          |
| UI 컴포넌트·색·폰트·토큰 변경                  | `docs/design/design-foundation.md` (디자인 담당과 함께)                                                                                 |
| 환경 변수 추가·변경                            | 루트 `.env.example`, 서비스 `.env.example`, 해당 앱 README                                                                              |
| 개발 절차·규약 변경 (브랜치, 커밋, 리뷰)       | `docs/guides/`                                                                                                                          |
| 새 Step 시작                                   | `docs/specs/SPEC-00N-*.md` 초안, 진행 상황판                                                                                            |
| Step 종료                                      | 위 Definition of Done 전체                                                                                                              |
| 동작이 바뀌지 않는 버그 수정·리팩터링          | 문서 없음. 단, 문서가 틀린 것을 발견했다면 그 자리에서 고친다                                                                           |

## 6. 문서 작성 규칙

### 파일과 제목

| 항목             | 규칙                                        | 예                                                           |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------ |
| 파일명           | 영어 kebab-case                             | `tech-stack.md`, `check-in.md`                               |
| 번호가 있는 문서 | 대문자 접두어 + 3자리 번호 + kebab-case     | `SPEC-003-application.md`, `ADR-007-database-per-service.md` |
| 인덱스·템플릿    | `README.md`, `TEMPLATE.md` (대문자)         | `docs/specs/TEMPLATE.md`                                     |
| 제목(H1)         | 파일당 하나. 한국어 문서 이름               | `# 기술 스택과 버전 결정`                                    |
| 절 제목          | `## 1.` 처럼 번호를 붙인다. 하위 절은 `###` | 기존 문서와 같은 형식                                        |
| 메타 정보        | H1 바로 아래에 목록으로 상태·날짜·작성자    | `- 상태: 초안`                                               |

### 표기

| 항목       | 규칙                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| 날짜       | `YYYY-MM-DD` (예: 2026-09-22)                                                                           |
| 상태       | 초안 / 확정 / 폐기. 자세한 뜻은 [7. 상태 표기](#7-상태-표기)                                            |
| 언어       | 한국어 기본. 코드 식별자, 파일명, 명령어, API 경로, 이벤트 이름, 환경 변수는 영어 원문 그대로           |
| 브랜드     | **오늘사이**(붙여쓰기). 영문은 **ONULSAI**. 패키지 스코프 `@oneul-sai/`는 코드 식별자이므로 그대로 둔다 |
| 문체       | 개발 문서는 "~한다" 서술형. 사용자 대상 문서(개요·기능 소개서)는 정중한 존댓말                          |
| 문장       | 짧게. 한 문장에 한 가지만                                                                               |
| 미정 사항  | "결정 예정"이라고 쓰고, 어느 Step에서 결정할지 함께 적는다. 예: "결정 예정 (Step 4 결제)"               |
| 링크       | 저장소 안은 상대 경로. 외부는 전체 URL                                                                  |
| 다이어그램 | Mermaid 우선(GitHub에서 그대로 렌더링). 간단한 구조도는 ASCII도 허용                                    |
| 표         | 훑어보기 용도. 열은 5개 이하를 권장                                                                     |

### 커밋

- 문서만 바꾸는 커밋은 `docs:` 타입을 쓴다. 예: `docs(specs): SPEC-001 회원/인증 설계서 초안`
- 코드와 함께 바뀌는 작은 문서 갱신(README 표, 환경 변수 표 등)은 그 코드 커밋에 포함한다. 설계서, API 인덱스처럼 따로 읽히는 문서는 별도 커밋으로 나눈다. 기준은 [브랜치와 커밋 가이드 3절](./guides/branching-and-commits.md#3-커밋-단위--의미-단위로-쪼개기).
- 커밋 형식은 Conventional Commits + 한국어 설명이다. 상세는 [브랜치와 커밋 가이드](./guides/branching-and-commits.md).

## 7. 상태 표기

| 상태 | 뜻                                                                      | 누가 바꾸나           |
| ---- | ----------------------------------------------------------------------- | --------------------- |
| 초안 | 쓰는 중이거나 리뷰 전. 내용이 바뀔 수 있다                              | 작성자                |
| 확정 | 리뷰를 통과했다. 이 문서를 기준으로 일한다. 바꾸려면 PR 리뷰가 필요하다 | 리뷰어 승인 후 작성자 |
| 폐기 | 더 이상 유효하지 않다. 대체 문서 링크를 남긴다. 파일은 지우지 않는다    | 대체 문서 작성자      |

ADR은 관례대로 `Proposed → Accepted → Superseded by ADR-0YY`를 그대로 쓴다. 뜻은 각각 초안 / 확정 / 폐기와 같다.

## 8. 이 문서의 갱신

문서 종류가 새로 생기거나 폴더가 바뀌면 이 문서의 2절 표와 3절 트리를 함께 고친다. 판단표(5절)에 없는 변경 유형을 만나면 먼저 [문서 갱신 규칙 2절](./guides/documentation-rules.md#2-변경-유형별-갱신-표)에 줄을 추가하고, 이 문서의 요약을 맞춘다.
