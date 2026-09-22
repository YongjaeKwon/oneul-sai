# 브랜치와 커밋

여러 개발자(그리고 AI 에이전트)가 같은 저장소에서 충돌 없이 일하기 위한 규칙이다.
도구(commitlint, husky 등)로 강제하지 않고 **규약과 리뷰**로 지킨다. 도구 도입 여부는 팀 규모가 커질 때 다시 결정한다(결정 예정).

- 상태: 확정
- 최종 갱신: 2026-09-22

---

## 1. 브랜치 전략

### 1.1 `main`은 항상 배포 가능

- `main`은 **보호 브랜치**다. 직접 push하지 않는다. 모든 변경은 PR을 거친다.
- PR은 CI(lint · typecheck · test · build)를 통과하고 리뷰 승인을 받아야 머지된다.
- `main`이 깨지면 다른 작업보다 먼저 고친다. 되돌리기(`revert`)가 가장 빠르면 되돌린다.
- 릴리스 브랜치 · 태그 전략은 배포 파이프라인이 생기는 **Step 8(운영 준비)** 에서 결정한다(결정 예정). 그때까지는 `main` 하나만 쓴다.

### 1.2 작업 브랜치 이름

```
<type>/<step>-<topic>
```

| 자리    | 값                                                 | 설명                                             |
| ------- | -------------------------------------------------- | ------------------------------------------------ |
| `type`  | `feat` `fix` `docs` `chore` `refactor` `test` `ci` | 커밋 type과 같은 단어를 쓴다                     |
| `step`  | `step0` ~ `step8`                                  | 로드맵 Step 번호. 특정 Step에 속하지 않으면 생략 |
| `topic` | kebab-case 영문                                    | 짧고 구체적으로. 2~4 단어                        |

예시:

| 브랜치                            | 상황                           |
| --------------------------------- | ------------------------------ |
| `feat/step1-auth`                 | Step 1 회원/인증 구현          |
| `feat/step3-application-capacity` | Step 3 참가 신청의 정원 동시성 |
| `fix/gateway-request-id`          | Step 무관한 Gateway 버그 수정  |
| `docs/step0-guides`               | Step 0 협업 가이드 문서        |
| `chore/repo-editorconfig`         | 저장소 공통 설정               |

- 브랜치는 **짧게** 살린다. 며칠 안에 머지하고 삭제한다. 오래 살수록 충돌이 커진다.
- 한 브랜치에서 여러 주제를 다루지 않는다. 주제가 갈라지면 브랜치를 새로 딴다.
- 다른 사람 브랜치에 force-push하지 않는다. 자기 브랜치는 정리를 위해 `--force-with-lease`까지만 허용한다.

### 1.3 흐름

```
main ──●──────────────●────────────●──▶
        \            /            /
         feat/step1-auth ──●──●──     (PR → CI → 리뷰 → 머지 → 브랜치 삭제)
```

1. `main`에서 브랜치를 딴다: `git switch -c feat/step1-auth main`
2. 의미 단위로 커밋한다(아래 3장).
3. `main`이 앞서가면 `git rebase main`으로 따라간다(머지 커밋을 만들지 않는다).
4. PR을 올린다([Pull Request 규칙](./pull-requests.md)).
5. 머지 후 브랜치를 삭제한다.

---

## 2. 커밋 메시지 규약

**Conventional Commits** 형식에 **한국어 제목**을 쓴다.

```
<type>(<scope>): <제목>            ← 50자 안. 마침표 없음
                                    ← 빈 줄
<본문>                              ← 왜 바꿨는지. 선택이지만 권장
                                    ← 빈 줄
<트레일러>                          ← Refs, Closes 등. 필요할 때만
```

### 2.1 type

| type       | 언제                                                         |
| ---------- | ------------------------------------------------------------ |
| `feat`     | 사용자·운영자에게 보이는 기능 추가, 새 서비스/패키지/앱 뼈대 |
| `fix`      | 버그 수정                                                    |
| `docs`     | 문서만 변경                                                  |
| `chore`    | 빌드·설정·의존성·저장소 정비 등 코드 동작과 무관한 변경      |
| `refactor` | 동작을 바꾸지 않는 코드 구조 변경                            |
| `test`     | 테스트 추가·수정만                                           |
| `ci`       | GitHub Actions 등 CI 변경                                    |
| `perf`     | 성능 개선                                                    |

### 2.2 scope

scope는 **바뀐 곳**을 말한다. 아래 목록에서 고른다. 여러 곳이 바뀌면 상위 scope를 쓰거나 생략한다.

| scope                                                | 범위                                              |
| ---------------------------------------------------- | ------------------------------------------------- |
| `repo`                                               | 루트 설정(pnpm, turbo, prettier, editorconfig 등) |
| `packages`                                           | `packages/*` 여러 개                              |
| `services`                                           | 백엔드 서비스 여러 개                             |
| `apps`                                               | 프론트엔드 앱 여러 개                             |
| `infra`                                              | `infra/*`, Docker, K8s, 모니터링                  |
| `docs`                                               | `docs/*` (type이 `docs`일 때는 보통 생략)         |
| `web` `admin` `mobile`                               | 각 프론트엔드 앱                                  |
| `gateway`                                            | `apps/api-gateway`                                |
| `member` `event` `matching` `notification` `payment` | 각 백엔드 서비스                                  |
| `contracts` `ui` `config` `logger` …                 | 특정 공유 패키지 하나만 바뀔 때 패키지 이름       |

### 2.3 제목

- **50자 안**. 한글은 한 글자가 한 자다.
- 무엇을 했는지 **명사형 또는 짧은 서술**로. "~추가", "~수정", "~통일", "~뼈대".
- 마침표를 찍지 않는다. 영문 고유명사(Prisma, Kafka, Gateway)는 그대로 쓴다.
- 한 제목에 `+`나 `·`로 두세 가지를 묶는 것은 허용한다. 단, 그것들이 **하나의 이야기**여야 한다.

### 2.4 본문

- **"왜"**를 쓴다. "무엇"은 diff가 말해 준다.
- 판단이 들어간 결정, 대안을 버린 이유, 주의할 점(예: "Nest CLI는 Node 22.14 크래시로 미사용")을 남긴다.
- 문장은 짧게. 줄은 72자 안에서 바꾼다.
- 아키텍처 수준의 결정은 본문이 아니라 **ADR**에 쓰고, 커밋에서는 ADR 번호를 가리킨다.

### 2.5 트레일러

트레일러는 본문 뒤 빈 줄 다음에 `키: 값` 형식으로 쓴다.

| 트레일러          | 언제                                                                          | 예                                               |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ |
| `Co-Authored-By`  | 사람 둘 이상이 함께 작성한 커밋(페어 작업)                                    | `Co-Authored-By: 이름 <이메일>`                  |
| `Refs`            | 관련 이슈·설계서를 가리킬 때                                                  | `Refs: #12`, `Refs: SPEC-001`                    |
| `Closes`          | 이슈를 닫는 커밋                                                              | `Closes: #12`                                    |
| `BREAKING CHANGE` | Contract·API·이벤트 스키마의 하위 호환이 깨질 때. 제목 type 뒤에 `!`도 붙인다 | `feat(contracts)!: ...` + `BREAKING CHANGE: ...` |

- AI 에이전트가 만들거나 고친 커밋에도 AI를 `Co-Authored-By`로 적지 **않는다**. 저자는 항상 사람이다(프로젝트 방침). 누가 시켰고 누가 검토했는지는 PR에 남는다.

### 2.6 실제 예 — 이 저장소의 첫 커밋들

첫 스캐폴드는 아래 여섯 개로 나누어 커밋했고, 이어서 브랜드 표기 정리 커밋 하나를 더했다.
**한 커밋이 한 층(layer)을 완성**하도록 나눈 예다.

```
chore(repo): pnpm workspace + Turborepo 루트 구성
feat(packages): 공유 패키지 9개 초기 구현
feat(services): API Gateway + NestJS 서비스 5개 뼈대
feat(apps): web·admin(Next 16) + mobile(Expo 57) 뼈대
chore(infra): Docker Compose(Postgres·Kafka profile), K8s/Helm/모니터링 구조, GitHub Actions CI
docs: README, 아키텍처 개요, ADR 8건, API/DB/이벤트 가이드
chore: 브랜드 표기를 오늘사이(ONULSAI)로 통일
```

본문까지 갖춘 예:

```
feat(services): API Gateway + NestJS 서비스 5개 뼈대

Gateway: /api/v1/** 프록시 라우팅, x-request-id 생성·전파, 구조화 요청 로그,
공통 에러 필터, Swagger. 서비스: Prisma 7(adapter-pg) 연결, /health(DB 상태),
Swagger, vitest, Dockerfile(turbo prune).
Nest CLI는 Node 22.14 크래시로 미사용(tsc + tsc-watch).
```

---

## 3. 커밋 단위 — 의미 단위로 쪼개기

**하나의 커밋 = 하나의 이야기.** 리뷰어가 커밋 제목만 읽고 흐름을 따라갈 수 있어야 한다.

### 3.1 나누는 기준

| 나눈다                                                          | 합친다                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| 설계서 작성 / Contract 추가 / 구현 / 문서 갱신은 각각 별도 커밋 | 한 기능의 컨트롤러 + 서비스 + 테스트는 한 커밋            |
| 리팩터링과 기능 추가는 분리                                     | 기능 추가와 그 기능의 README 표 갱신은 함께               |
| 포맷팅만 바꾼 변경은 분리                                       | 오타 수정 여러 개는 하나로                                |
| 서비스 A와 서비스 B의 독립적인 변경은 분리                      | Contract 변경과 그 소비자 갱신은 함께(빌드가 깨지지 않게) |

### 3.2 한 Step을 커밋으로 나누는 예 (Step 1 회원/인증을 가정)

```
docs(specs): SPEC-001 회원/인증 설계서 초안          ← 별도 PR로 먼저 머지
feat(contracts): 회원 가입·로그인 요청/응답 계약
feat(member): 회원 가입 API + Prisma Member 모델
feat(member): 로그인 · 토큰 발급
test(member): 회원 가입 동시 요청 케이스
docs(api): members 엔드포인트 인덱스 · 에러 코드 갱신
```

- 위 예시의 API 형태와 모델 이름은 **설명용**이다. 실제 내용은 `docs/specs/SPEC-001-member-auth.md`에서 결정한다(결정 예정, Step 1).

### 3.3 피해야 할 것

- `wip`, `fix`, `수정` 같은 제목. 머지 전에 `git rebase -i`로 정리한다(대화형이 어려우면 `git commit --fixup` 후 `git rebase --autosquash`).
- 하나의 커밋에 여러 서비스의 무관한 변경을 담는 것.
- 빌드가 깨지는 중간 커밋. 각 커밋은 `pnpm build && pnpm typecheck`가 통과하는 상태여야 한다(bisect가 가능해진다).
- 생성 파일(`src/generated/`, `dist/`, `.turbo/`)이 섞인 커밋. `.gitignore`가 막지만 `git status`를 확인한다.

---

## 4. 빠른 참조

```bash
git switch -c feat/step1-auth main         # 브랜치
git add -p                                 # 변경을 덩어리로 나눠 담기
git commit                                 # 제목 + 빈 줄 + 본문
git fetch origin && git rebase origin/main # main 따라가기
git push -u origin feat/step1-auth         # PR 올리기
git push --force-with-lease                # 정리 후 다시 push (자기 브랜치만)
```
