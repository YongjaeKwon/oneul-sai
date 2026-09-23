# 문서 갱신 규칙

**문서도 코드다.** 코드가 바뀌면 문서도 **같은 PR**에서 바뀐다.
이 문서는 "어떤 변경에 어떤 문서를 고치는가"의 **원천(source of truth)** 이다.
[문서 지도(docs/README.md)](../README.md)의 5절 판단표는 이 문서 2절의 **요약**이다. 두 표가 다르면 이 문서를 고치고 요약을 맞춘다.

- 상태: 확정
- 최종 갱신: 2026-09-22

---

## 1. 문서 지도

| 문서 종류                   | 위치                                                                                                              | 답하는 질문                                                   | 주로 고치는 사람              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------- |
| 개요 소개서                 | [docs/overview/project-overview.md](../overview/project-overview.md)                                              | 오늘사이는 무엇이고 어떻게 이루어져 있나 (비개발자도 읽음)    | 서비스 방향을 바꾸는 사람     |
| 용어 사전                   | [docs/overview/glossary.md](../overview/glossary.md)                                                              | 이 말은 무슨 뜻이고 코드에서는 무엇인가                       | 새 용어를 만드는 사람         |
| 기능 소개서                 | [docs/overview/features/](../overview/features/README.md)                                                         | 이 기능은 사용자·운영자에게 어떻게 보이나 (기능 하나당 1문서) | 기능을 만드는 사람            |
| 기능 설계서 (SPEC)          | [docs/specs/](../specs/README.md)                                                                                 | 이 Step에서 정확히 무엇을 어떻게 만드나                       | Step 담당자 (구현 전에)       |
| 아키텍처 개요               | [docs/architecture/overview.md](../architecture/overview.md)                                                      | 시스템은 어떤 조각으로 이루어졌고 어떻게 통신하나             | 구조를 바꾸는 사람            |
| 기술 스택                   | [docs/architecture/tech-stack.md](../architecture/tech-stack.md)                                                  | 어떤 기술·버전을 쓰고, 알려진 함정은 무엇인가                 | 의존성을 올리는 사람          |
| ADR                         | [docs/adr/](../adr/README.md)                                                                                     | 왜 그렇게 결정했나                                            | 결정을 내리는 사람            |
| API 규칙                    | [docs/api/README.md](../api/README.md)                                                                            | 라우팅 · 에러 · 버전 · Health 규칙, 엔드포인트 인덱스         | 엔드포인트를 바꾸는 사람      |
| 데이터베이스                | [docs/database/README.md](../database/README.md)                                                                  | DB 소유권 · Prisma 워크플로우 · 마이그레이션                  | 스키마를 바꾸는 사람          |
| 이벤트                      | [docs/events/README.md](../events/README.md)                                                                      | Kafka 이벤트 이름 · 봉투 · 신뢰성 규칙                        | 이벤트를 추가하는 사람        |
| 디자인 파운데이션           | [docs/design/design-foundation.md](../design/design-foundation.md), [브랜드 원본 자산](../design/brand/README.md) | 브랜드 · 색 · 글꼴 · 컴포넌트 · 문구 톤                       | 디자인 담당 (UI 변경 시 협의) |
| 협업 가이드                 | `docs/guides/`                                                                                                    | 어떻게 같이 일하나                                            | 규칙을 바꾸는 사람            |
| README                      | 루트 · `apps/*` · `packages/*` · `infra/*`                                                                        | 이 디렉토리는 무엇이고 어떻게 실행하나                        | 그 디렉토리를 바꾸는 사람     |
| CONTRIBUTING.md / AGENTS.md | 루트                                                                                                              | 사람 / AI 에이전트를 위한 규칙 요약                           | 규칙을 바꾸는 사람            |
| 진행 상황판                 | 외부 아티팩트 (6절)                                                                                               | 각 Step이 어디까지 왔나                                       | PR 작성자                     |

## 2. 변경 유형별 갱신 표

PR을 올리기 전 자기 변경이 어느 줄에 해당하는지 찾고, "반드시" 열의 문서를 갱신한다. "검토" 열은 바뀌었는지 확인만 한다. 여러 줄에 해당하면 모두 고친다.

| 변경 유형                                        | 반드시 갱신                                                                                                                                                                               | 검토                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **새 비즈니스 기능 착수** (Step 시작)            | `docs/specs/SPEC-00N-<slug>.md` 초안을 **먼저** 작성 · 리뷰 · 머지, 상황판 "진행 중"                                                                                                      | 용어 사전, 기능 소개서 초안                                       |
| **비즈니스 기능 구현 완료**                      | 설계서의 "17. 실제 구현과의 차이" 절, 기능 소개서(`docs/overview/features/`), 상황판                                                                                                      | 루트 README와 아키텍처 개요의 "현재 구현 범위" 표                 |
| **Step 종료** (Definition of Done 충족)          | 개요 소개서 5장 로드맵 표의 상태(Step 상태의 원천), `AGENTS.md` 5절 로드맵 표, 상황판 "완료". 전체 목록은 [docs/README.md 4절](../README.md#4-한-기능이-끝났다의-정의-definition-of-done) | 루트 README "현재 상태와 Roadmap", 아키텍처 개요 "현재 구현 범위" |
| **API 엔드포인트 추가 · 변경 · 삭제**            | 컨트롤러 Swagger 데코레이터, `docs/api/README.md`(라우팅 표 · 엔드포인트 인덱스), `packages/contracts`, `packages/api-client`                                                             | 설계서 "7. API 변경" 절, `apps/api-gateway/README.md`             |
| **Gateway 라우팅 · 미들웨어 변경**               | `docs/api/README.md` 라우팅 표, `apps/api-gateway/src/proxy/routes.ts`, `apps/api-gateway/README.md`                                                                                      | `docs/architecture/overview.md` (Request ID 절)                   |
| **Prisma 스키마 · 마이그레이션**                 | `docs/database/README.md`, 설계서 "9. DB 변경" 절                                                                                                                                         | ADR-007 위반 여부                                                 |
| **Kafka 이벤트 추가 · 변경**                     | `docs/events/README.md`(이벤트 목록 · 버전), `packages/contracts`, 설계서 "8. 이벤트" 절                                                                                                  | 소비 서비스 README, ADR-005 · ADR-006                             |
| **서비스 경계 · 책임 · 포트 변경**               | `docs/architecture/overview.md`, 루트 README, 해당 서비스 README. 경계 변경은 **새 ADR**                                                                                                  | CLAUDE.md 구조 절                                                 |
| **라이브러리 메이저 업그레이드 · 새 기술 도입**  | `docs/architecture/tech-stack.md`(버전 표 · 함정). 되돌리기 어렵다면 새 ADR                                                                                                               | 루트 README 기술 스택 절, CI `node-version`, Dockerfile 베이스    |
| **되돌리기 어려운 구조 결정**                    | 새 ADR + `docs/adr/README.md` 인덱스                                                                                                                                                      | `docs/architecture/overview.md`, CLAUDE.md                        |
| **사용자에게 보이는 규칙 · 화면 · 문구 변경**    | 기능 소개서 해당 문서, 용어 사전                                                                                                                                                          | 디자인 파운데이션 "문구 톤" 절과 맞는지                           |
| **UI 컴포넌트 · 색 · 글꼴 · 토큰**               | `docs/design/design-foundation.md`(디자인 담당과 함께), `packages/ui/README.md`                                                                                                           | 기능 소개서 화면 설명                                             |
| **환경 변수 추가 · 변경**                        | 루트 `.env.example`, 해당 앱 `.env.example`, 해당 앱 README의 변수 표                                                                                                                     | `docs/guides/onboarding.md`                                       |
| **새 앱 · 서비스 · 패키지**                      | 루트 README 표, `docs/architecture/overview.md` 구조도, 해당 디렉토리 README, `.github/CODEOWNERS`                                                                                        | CLAUDE.md 구조 절, CI                                             |
| **루트 커맨드 · 툴체인 변경**                    | 루트 README, `CONTRIBUTING.md`, `docs/guides/onboarding.md`, `docs/architecture/tech-stack.md`                                                                                            | CLAUDE.md 커맨드 절, `.vscode/`                                   |
| **용어 신설 · 변경**                             | 용어 사전                                                                                                                                                                                 | 코드 식별자 · Swagger 설명이 용어와 맞는지                        |
| **협업 규칙 변경** (브랜치 · 커밋 · 리뷰 · 문서) | `docs/guides/*` 해당 문서, `CONTRIBUTING.md`                                                                                                                                              | CLAUDE.md, PR/이슈 템플릿, `docs/README.md` 5절 요약              |
| **인프라** (compose, K8s, 모니터링)              | `infra/*/README.md`, 루트 README 설치 절                                                                                                                                                  | ADR-008, `docs/database/README.md` 로컬 실행 절                   |
| **CI 변경**                                      | `.github/workflows/*` 주석, `docs/guides/pull-requests.md` 셀프 체크 표                                                                                                                   | CONTRIBUTING.md                                                   |
| **동작이 바뀌지 않는 버그 수정 · 리팩터링**      | 없음. 단, 원인이 문서와 어긋난 것이면 그 문서                                                                                                                                             | onboarding "자주 겪는 문제", tech-stack "함정"에 추가할지         |

- 표에 없는 변경이라면 "이 변경을 모르는 동료가 어떤 문서를 읽고 놀랄까"를 기준으로 판단하고, **이 표에 줄을 추가**한 뒤 `docs/README.md` 5절 요약도 맞춘다.

## 3. 설계서(SPEC)는 코드보다 먼저

설계서 운영 방식의 원천은 [docs/specs/README.md](../specs/README.md)다. 여기서는 갱신 규칙에 필요한 것만 요약한다.

- **비즈니스 기능은 설계서가 먼저다.** 설계서 PR이 머지된 뒤 구현 PR을 올린다. 설계서 없이 구현이 먼저 됐다면 머지 전에 채워 넣는다. 예외를 만들지 않는다.
- 파일 이름은 `SPEC-00N-kebab-slug.md`. 001~008은 로드맵 Step 1~8에 예약되어 있다. [TEMPLATE.md](../specs/TEMPLATE.md)를 복사해 쓴다.
- 구현 중 설계와 다르게 가야 하면 **코드 PR에서 설계서를 함께 고친다.** 구현이 끝나면 "17. 실제 구현과의 차이" 절을 채운다.
- 설계서는 팜플렛과 운영 방침의 사실에서 출발한다. 없는 기능을 상상해 넣지 않는다. 미정은 "결정 예정 (Step N)".

## 4. 문서 리뷰 규칙

문서 PR도 코드 PR과 **같은 규칙**([Pull Request 규칙](./pull-requests.md))을 따른다. 리뷰어 1명 이상, 체크리스트, CI. 리뷰어는 아래를 본다.

| 확인   | 기준                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 사실   | 코드 · 설정 · 포트 · 명령이 실제와 일치하나 (직접 실행해 본다)                                                                  |
| 용어   | [용어 사전](../overview/glossary.md)과 같은 말을 쓰나. 같은 것을 다른 이름으로 부르지 않나 ("행사" vs "Kafka 이벤트" 구분 포함) |
| 브랜드 | **오늘사이** 붙여쓰기, 영문 **ONULSAI**, 태그라인 "오늘, 우리 사이의 시작."                                                     |
| 미결   | 정해지지 않은 것을 정해진 것처럼 쓰지 않았나. "결정 예정 (Step N)" 표기                                                         |
| 중복   | 같은 규칙이 두 문서에 있지 않나. 원천 하나 + 링크                                                                               |
| 링크   | 상대 경로가 깨지지 않나. 파일 이름을 바꿨다면 가리키는 곳을 모두 고쳤나                                                         |
| 형식   | [문서 작성 규칙](../README.md#6-문서-작성-규칙)을 따르나 — 메타(상태 · 최종 갱신), 번호 절, 문체                                |
| 상태   | 리뷰 통과 시 "초안" → "확정"으로 바꿨나. 대체된 문서는 "폐기"와 대체 링크                                                       |

## 5. 작성 원칙 (요약)

파일명 · 제목 · 표기 · 문체의 상세 규칙은 [docs/README.md 6절](../README.md#6-문서-작성-규칙)이 원천이다. 갱신 관점에서 특히 지킬 것만 적는다.

1. **하나의 원천.** 같은 내용을 두 곳에 쓰지 않는다. 한 곳에 쓰고 링크한다. 요약을 둘 때는 "원천은 X"라고 밝힌다.
2. **현재 상태를 쓴다.** "예정"과 "구현됨"을 섞지 않는다. 구분이 필요하면 표의 열로 나눈다.
3. **결정은 ADR, 규칙은 guides, 사실은 README, 이유는 SPEC.** 문서 종류를 섞지 않는다.
4. **날짜보다 Step.** 일정은 바뀌지만 Step 번호는 안정적이다. "Step 4에서 결정"처럼 쓴다.
5. **바꾼 문서의 "최종 갱신" 날짜를 올린다.** 내용이 바뀐 문서만.

## 6. 상황판 갱신 시점

진행 상황판: <https://claude.ai/artifact/M3foVY7pn38tXo5QguZvXa>

| 시점                           | 갱신 내용                          | 누가                 |
| ------------------------------ | ---------------------------------- | -------------------- |
| Step 착수 (브랜치 생성)        | 해당 Step → "진행 중"              | Step 담당자          |
| 설계서 PR 머지 (확정)          | "설계 완료" 표시                   | PR 작성자            |
| 구현 PR 머지 (부분)            | 완료된 조각 체크                   | PR 작성자, 머지 직후 |
| Step의 Definition of Done 충족 | 해당 Step → "완료", 다음 Step 준비 | Step 담당자          |
| 계획 변경 (순서 · 범위)        | 로드맵 표 수정 + 이유 한 줄        | 결정한 사람          |

- 상황판은 **머지 직후**에 갱신한다. 나중으로 미루면 잊는다.
- 상황판과 문서가 어긋나면 **문서가 원천**이다. 상황판을 문서에 맞춘다.
- Step 단위 Definition of Done의 전체 목록은 [docs/README.md 4절](../README.md#4-한-기능이-끝났다의-정의-definition-of-done), PR 단위는 [Pull Request 규칙 7절](./pull-requests.md#7-definition-of-done).

## 7. ADR을 새로 쓰는 시점

아래 중 하나면 ADR을 쓴다. 판단이 서지 않으면 쓴다 — 짧은 ADR이 없는 ADR보다 낫다.

- 새 기술 · 라이브러리 · 외부 서비스(PG, 알림톡 사업자 등)를 도입한다.
- 서비스 경계나 DB 소유권을 바꾼다.
- 동기/비동기 선택처럼 여러 Step에 걸쳐 영향을 주는 패턴을 정한다.
- 설계서 안의 결정 중 **되돌리기 어려운 것**이 있다. 설계서는 ADR 번호를 참조한다.
- 이미 있는 ADR의 결정을 뒤집는다 → 새 ADR을 쓰고, 옛 ADR은 상태만 `Superseded by ADR-0YY`로 바꾼다. 삭제하지 않는다.

형식과 인덱스는 [docs/adr/README.md](../adr/README.md)를 따른다.
