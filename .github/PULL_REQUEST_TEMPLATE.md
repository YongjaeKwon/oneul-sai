<!--
제목은 커밋 규약과 같은 형식으로 씁니다. 예) feat(member): 회원 가입 API
항목을 지우지 말고, 해당 없으면 "해당 없음"이라고 적어 주세요.
규칙: docs/guides/pull-requests.md
-->

## 변경 요약

<!-- 무엇을, 왜 바꿨는지 2~5줄. "왜"가 더 중요합니다. -->

## 관련 Step / 설계서 / ADR

- Step: <!-- 예) Step 1 회원/인증 · 해당 없음 -->
- 설계서: <!-- 예) docs/specs/SPEC-001-member-auth.md · 해당 없음 -->
- ADR: <!-- 예) ADR-004, ADR-007 · 해당 없음 -->
- 이슈: <!-- 예) Closes #12 · 해당 없음 -->

## 스크린샷 (UI 변경 시)

<!-- 전 / 후. 모바일은 iOS / Android 중 확인한 쪽을 적어 주세요. UI 변경이 없으면 "해당 없음". -->

## 확인한 것

- [ ] `pnpm build` 통과
- [ ] `pnpm typecheck` 통과
- [ ] `pnpm lint` 통과 (`pnpm format:check` 포함)
- [ ] `pnpm test` 통과 (새 로직에는 새 테스트)
- [ ] 로컬에서 바뀐 서비스의 `/health`와 관련 엔드포인트를 직접 호출해 확인
- [ ] 커밋 이력 정리 (`wip` 없음, 각 커밋이 규약을 따름)
- [ ] `.env` · 토큰 · 개인정보가 diff에 없음

## 문서 갱신

<!-- docs/guides/documentation-rules.md 의 "변경 유형별 갱신 표"를 보고 해당하는 것을 체크합니다. -->

- [ ] 기능 소개서 (`docs/overview/features/`) / 용어 사전 (`docs/overview/glossary.md`)
- [ ] 설계서 (`docs/specs/SPEC-00N-*.md`) — 설계와 달라진 점을 "17. 실제 구현과의 차이" 절에 반영
- [ ] API 규칙 (`docs/api/README.md`) / Swagger
- [ ] 데이터베이스 (`docs/database/README.md`)
- [ ] 이벤트 (`docs/events/README.md`)
- [ ] ADR (새 결정 또는 기존 결정 변경)
- [ ] 기술 스택 (`docs/architecture/tech-stack.md`) — 버전 · 함정
- [ ] README (루트 / 앱 / 패키지) · `.env.example`
- [ ] 문서 갱신이 필요 없는 변경임 (이유: <!-- 한 줄 -->)

## 서비스 경계 체크

- [ ] 다른 서비스의 DB(테이블 · Prisma 모델 · `DATABASE_URL`)를 참조하지 않는다
- [ ] 공유 패키지(`packages/*`)에 비즈니스 로직을 넣지 않았다 — Contract(스키마 · 타입)만
- [ ] Contract를 바꿨다면 이를 쓰는 서비스 · api-client · 프론트엔드를 같은 PR에서 갱신했다

## 되돌리기 방법

<!-- 예) `git revert`로 되돌릴 수 있음 · 마이그레이션 포함: `prisma migrate` 롤백 절차는 ... -->

## 상황판

- [ ] 머지 직후 진행 상황판의 해당 Step 상태를 갱신한다
