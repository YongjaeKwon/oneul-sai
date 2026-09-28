# @oneul-sai/e2e

오늘사이 브라우저 e2e 테스트(Playwright)입니다. 대표 흐름 두 개만 끝에서 끝까지 봅니다([SPEC-003](../../docs/specs/SPEC-003-application.md) 13절 · 개발 승인 Q).

| 테스트                      | 흐름                                                                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/participant.spec.ts` | 참가자(web): 로그인하지 않고 일정 상세 → "로그인" → 같은 일정으로 돌아와 "참가 신청" → 접수됨 · 입금 대기 · 신청 금액 → 내 신청에서 본인 취소                                                                                       |
| `tests/admin.spec.ts`       | 운영자(admin): 로그인 → 회차 상세의 신청 요약 → 신청 목록(이름 · 휴대폰 · 입금 대기) → 운영자 취소 → "취소" 필터에서 취소 · 운영자 · 취소 시각 → 그 회원으로 web에 로그인해 일정 상세의 다시 신청 막기 · 내 신청의 운영자 취소 문구 |

- 준비(가입 · 상품 · 회차 만들기 · 공개 · 신청)는 화면이 아니라 Gateway API로 한다(`tests/api.ts`). 테스트마다 새 회원(고유 이메일)과 새 회차를 만들어 기존 데이터에 기대지 않는다.
- 확인은 문구 · 역할 · 주소(`getByRole` · `getByText` · `toHaveURL`)로 한다. 화면 비교(`toHaveScreenshot` · 스냅샷)는 쓰지 않는다. 실패하면 trace를 남긴다(`test-results/`, CI는 아티팩트 `e2e-traces`).
- 보지 않는 것: 정원 동시성 · 잠금 대기(event-service 순서 강제 통합 테스트), 판정 코드 하나하나(단위 · 통합), 성별 자리 마감 표시(공개 캐시 30초), member-service 장애의 503(수동), 화면 모양(디자인 담당 확인), Chromium 밖의 브라우저.
- Chromium 하나, 순서대로(`workers: 1`).

## 실행

로컬은 떠 있는 dev 서버를 다시 쓴다(`reuseExistingServer`). web(3000) · admin(3001) · Gateway(4000) · member-service(4001) · event-service(4002)를 먼저 띄운다.

```bash
cp apps/e2e/.env.example apps/e2e/.env                          # 로컬 운영자 계정을 적는다
pnpm --filter @oneul-sai/e2e exec playwright install chromium   # 처음 한 번 — 브라우저를 받는다
pnpm --filter @oneul-sai/e2e test:e2e
```

- 개발 DB(`member_db` · `event_db`)에 테스트 회원 · 상품 · 회차 · 신청이 남는다.
- 스크립트 이름이 `test`가 아니라 `test:e2e`다 — 루트 `pnpm test`(CI `ci` 잡)는 서버 없이 돌므로 브라우저 테스트를 부르지 않는다.
- 한 번 돌 때 Gateway의 IP 요청 제한 경로(로그인 · refresh · 가입)를 약 14번 부른다 — 로그인 6, 화면을 새로 열 때(`page.goto`)의 refresh 6, 가입 2. 로컬 기본값 `RATE_LIMIT_AUTH_PER_MINUTE=10`으로는 모자라니 `apps/api-gateway/.env`에서 CI 잡과 같은 `100`으로 올리고 Gateway를 다시 띄운다. 제한에 걸린 refresh는 오류가 아니라 로그아웃된 화면으로 보인다(실패하면 trace의 네트워크 탭에서 429를 본다).
- 한 번 돌 때 운영자 로그인 세션이 3개 남는다(`tests/api.ts`의 API 로그인 2, 화면 로그인 1). 회원 한 명의 세션은 10개까지라 가장 오래된 것부터 끊기므로(SPEC-001), 여러 번 돌리면 브라우저에 로그인해 둔 로컬 운영자 웹이 로그아웃될 수 있다.

CI(`.github/workflows/ci.yml`의 `e2e` 잡, `needs: [ci, integration]`)는 Postgres 서비스 컨테이너에 마이그레이션을 적용하고, 서비스 · 앱을 빌드하고, CI 전용 더미 값으로 운영자를 seed한 뒤, Playwright `webServer`가 각자의 `start`로 서버를 띄워 돈다.

## 환경 변수

`apps/e2e/.env`(gitignore)에 적는다. 검증은 `env.ts`(`@oneul-sai/config`의 `parseEnv`).

| 변수                                                 | 기본값                                        | 설명                                                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E_ADMIN_EMAIL`                                    | (필수)                                        | 운영자 계정 이메일 — member-service `db:seed`의 `SEED_ADMIN_EMAIL`과 같다                                                                           |
| `E2E_ADMIN_PASSWORD`                                 | (필수)                                        | 그 계정의 비밀번호. 저장소에 적지 않는다(CI는 CI 전용 더미)                                                                                         |
| `E2E_API_URL` · `E2E_WEB_URL` · `E2E_ADMIN_URL`      | `http://localhost:4000` · `…:3000` · `…:3001` | Gateway · web · admin 주소                                                                                                                          |
| `E2E_MEMBER_DATABASE_URL` · `E2E_EVENT_DATABASE_URL` | 로컬 `member_db` · `event_db`                 | Playwright가 서버를 직접 띄울 때(CI, 또는 로컬에서 그 서버가 떠 있지 않을 때 — 빌드 결과를 `start`로 띄운다)만 — 서비스마다 `DATABASE_URL`로 넘긴다 |
| `CI`                                                 | `false`                                       | 켜지면 서버를 다시 쓰지 않고 띄우며, `test.only`를 막는다                                                                                           |
