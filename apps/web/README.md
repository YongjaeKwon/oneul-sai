# @oneul-sai/web

오늘사이 참가자 Web 앱 (Next.js 16 App Router, 포트 3000).

## 역할

- 참가자 대상 웹 화면 — 랜딩, 가입 · 로그인 · 내 프로필(SPEC-001), 공개 일정 목록 · 상세(SPEC-002), 참가 신청 · 내 신청(SPEC-003), 추후 매칭 화면
- `@oneul-sai/ui` 공용 컴포넌트와 `@oneul-sai/api-client`를 통해 API Gateway(4000)와 통신한다. 다른 서비스 포트를 직접 부르지 않는다.

## 화면 (SPEC-001 · SPEC-002 · SPEC-003 4절 "참가자 웹")

| 경로               | 화면                             | 비고                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                | 랜딩 · W7                        | 머리글에 로그인 여부(로그인 · 가입하기 / 내 정보 · 로그아웃). "다가오는 일요일 보기"는 `/events` 링크                                                                                                                                                                                                                                                                                                    |
| `/events`          | W8 일정 목록                     | 서버 렌더. `?page=`는 [1, `PAGE_MAX`] 정수로 고정(잘못된 값은 1), 20개씩. 제목의 한 단어에 `Highlight`. 배지는 "모집 마감"이 먼저, 모집 중이면 "남성 · 여성 자리 마감" · "남녀 자리 모두 마감"(남은 자리 수는 없음)                                                                                                                                                                                      |
| `/events/[id]`     | W9 일정 상세                     | 서버 렌더. `id`가 UUID가 아니면 API를 부르지 않고 404 화면. 장소는 지역만. W8과 같은 배지. 본문 아래 **참가 신청 영역**(클라이언트 컴포넌트, 아래)                                                                                                                                                                                                                                                       |
| `/signup`          | W1 가입                          | 이메일 · 비밀번호 · 이름 · 성별 · 출생연도 · 휴대폰 · 동의 2개. 201이면 바로 로그인해 `/me`로(`?next=` 아래)                                                                                                                                                                                                                                                                                             |
| `/login`           | W2 로그인                        | `client: 'WEB'`. 다섯 번째 시도부터는 응답이 늦어지므로 버튼을 잠근 채 기다린다. `?next=/events/<UUID>`면 로그인 뒤 그 일정으로(아래)                                                                                                                                                                                                                                                                    |
| `/me`              | W3 내 프로필 · W4 수정 · W6 탈퇴 | 휴대폰 · 마케팅 수신만 수정(휴대폰은 현재 비밀번호 필요). 로그아웃 · 모든 기기에서 로그아웃 · 탈퇴는 확인 모달                                                                                                                                                                                                                                                                                           |
| `/me/password`     | W5 비밀번호 변경                 | 204 뒤 현재 탭은 로그인 상태 유지                                                                                                                                                                                                                                                                                                                                                                        |
| `/me/applications` | W10 내 신청                      | 최근 신청 먼저 20개씩(`?page=`). 카드에 일시 · 제목 · 지역 · 참가비(신청 때 금액) · 상태 배지(입금 대기 `warning` · 취소 `danger`) · 안내 한 줄. 신청 마감 전 입금 대기만 "신청 취소". 공개 중인 일정만 상세 링크. 운영자 계정은 조회하지 않고 "운영자 계정으로는 신청할 수 없습니다."(`/me`의 "내 신청" 버튼도 회원에게만). 페이지를 옮기는 동안 이전 페이지를 보이고 그 카드로는 취소 창을 열지 않는다 |

이미 로그인한 상태로 `/signup` · `/login`에 오면 `/me`로, 로그인하지 않고 `/me/*`에 오면 `/login`으로 보낸다. `?next=`가 `/events/<UUID>` 모양과 글자 그대로 맞으면 로그인 · 가입 뒤 그 일정으로 보낸다 — 그 밖의 값은 버린다(열린 리디렉트 방지, SPEC-003 D12, `lib/next-path.ts`). 로그인 ↔ 가입 링크도 `next`를 잇는다.

## 참가 신청 (SPEC-003 4절 W9 · W10)

- W9 참가 신청 영역(`components/apply-area.tsx`)은 위에서부터 먼저 맞는 하나를 보인다: (a) 지난 일정은 영역 없음(서버 렌더) · (b) 로그인 확인 중 · (c) 로그인 안 함 → `/login?next=/events/<id>` · (d) 운영자 계정 · (e) 내 입금 대기 신청 있음 → 접수됨 + 신청 취소(신청 마감 전) · (f) 모집 마감 · (g) 운영자가 취소한 신청 있음 · (h) 남성 연령대 밖 · (i) 내 성별 자리 마감 · (j) "참가 신청". 판정은 순수 함수 `applyAreaState`(`lib/applications.ts`)다. (f)~(i)의 순서는 서버 판정 순서(D7)와 같고, (e) 내 신청은 W9대로 (f)보다 먼저 본다 — 화면 편의일 뿐 원천은 서버다.
- 신청 데이터는 서버 렌더 · 30초 캐시에 들어가지 않는다. `GET /api/v1/applications?scheduleId=`를 클라이언트에서 TanStack Query로 부르고(운영자 계정은 403이라 부르지 않는다), 신청 · 취소가 끝나면(성공 · 실패 모두) 내 신청 쿼리를 무효화해 서버 상태로 다시 판정한다.
- 영역은 `aria-live="polite"` 한 `section`이라 신청 · 취소 결과로 바뀐 문구가 스크린 리더에 읽힌다. 오류 알림은 바뀐 상태가 같은 문장을 이미 보이면 빼서 두 번 보이지 않는다.
- 확인 창은 `ConfirmDialog`(`packages/ui` `Dialog`) — 버튼은 [확인][닫기](주 동작 먼저, 디자인 파운데이션 5절), 처음 포커스는 "닫기", 질문 문장은 `aria-describedby`, 제출 중에는 두 버튼을 막는다. 오류 문구는 `code`로 고른다(`describeApplicationError`, SPEC-003 4절 표). 401은 세션을 끝내 (c)로 돌아간다.

## 인증 동작

- access token은 `lib/api.ts`의 `ApiClient` 인스턴스 메모리에만 있다(SPEC-001 D4). refresh 토큰은 httpOnly 쿠키 `onulsai_rt_web`이며 브라우저가 `credentials: 'include'`로 Gateway에 보낸다.
- 부팅 시 `AuthProvider`(`lib/auth.tsx`)가 `POST /api/v1/auth/refresh` `{ client: 'WEB' }`를 한 번 호출해 토큰을 채운다. 400 · 401 · 403이면 로그아웃 상태다. 판정이 끝날 때까지 보호 화면은 로딩을 보여 준다(`components/require-auth.tsx`).
- 보호 요청이 401 `TOKEN_EXPIRED`를 받으면 api-client가 refresh 뒤 한 번 재시도한다. refresh까지 실패하면 토큰이 비고 앱은 "로그인이 만료되었습니다"를 보여 준다.
- 보호 데이터는 모두 클라이언트 컴포넌트에서 TanStack Query로 조회한다(`lib/queries.ts`). 서버 컴포넌트 · Route Handler에서 보호 경로를 부르지 않는다(토큰 없이 부르는 공개 일정 조회는 보호 데이터가 아니다 — 아래).
- 폼은 React Hook Form + `@hookform/resolvers/zod`이며 스키마는 `@oneul-sai/contracts`의 요청 스키마를 확장한다(`lib/schemas.ts` — 만 19세 · 필수 동의 · 비밀번호 확인 일치).
- 에러는 `ApiErrorResponse.code`로만 분기한다(`lib/errors.ts`). 문구는 SPEC-001 4절 · 7절.

## 공개 일정 조회 (서버 렌더, SPEC-002 D11)

토큰 없이 부르는 `@Public` 조회는 서버 컴포넌트가 Gateway를 불러 렌더한다. 보호 데이터 규칙(ADR-009 결정 5)의 예외가 아니라 범위 밖이다 — [docs/api/README.md](../../docs/api/README.md) 5.5절.

- 서버 호출은 `lib/public-api.ts`(첫 줄 `import 'server-only'`)만 한다. 내보내는 것은 `listPublicEvents(page)` · `getPublicEvent(id)` 두 함수뿐이고, `client` 없이 만든 `ApiClient` 인스턴스는 모듈 밖으로 내보내지 않는다. 두 메서드는 항상 `auth: false`라 `Authorization`이 없다. `baseUrl`은 `NEXT_PUBLIC_API_URL`을 서버에서도 쓴다(새 env 없음).
- 캐시는 함수 단위 `unstable_cache`(키 = 함수 이름 + `page` 또는 `id`, 재검증 30초)다. `fetch`의 `next.revalidate`는 쓰지 않는다 — api-client가 호출마다 붙이는 무작위 `x-request-id`가 키에 들어가 적중하지 않는다. `'use cache'`는 `cacheComponents` 설정 변경이 필요해 쓰지 않았다.
- 키가 끝없이 늘지 않게 캐시 앞에서 값을 좁힌다: `page`는 `normalizePage`(`lib/format.ts`), `id`는 UUID가 아니면 `notFound()`.
- 실패(4xx · 5xx · 네트워크)는 캐시하지 않는다. 캐시가 만료(30초)된 뒤 다시 부를 때 Gateway가 실패하면 이전 값을 계속 보여 주고, 다음 요청에서 다시 부른다(Next `unstable_cache`의 동작).
- 목록 · 상세의 불러오기 실패는 "일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", 상세의 404 `SCHEDULE_NOT_FOUND`(없음 · 비공개 · 취소)는 `notFound()` → "일정을 찾을 수 없습니다."(`app/events/[id]/not-found.tsx`). 성별 자리 마감 배지도 이 캐시를 거쳐 최대 30초 늦게 보일 수 있다 — 신청 판정의 원천은 서버다.
- 날짜 · 시간은 서버 시간대와 무관하게 Asia/Seoul(`SERVICE_TIME_ZONE`)로 보인다. "모집 마감"(CLOSED 또는 신청 마감 경과)과 "지난 일정입니다."는 요청 시각으로 렌더할 때 계산한다. 표시 도우미는 `lib/format.ts`.
- 설명은 평문이다 — 텍스트 노드 + `white-space: pre-line`으로만 렌더한다(`dangerouslySetInnerHTML` 금지, SPEC-002 12절).

## 구조

```
app/            layout(머리글 · 글꼴) · providers(QueryClient + AuthProvider) · page(랜딩)
app/(auth)/     signup · login — 로그인 상태면 /me로
app/me/         page(프로필) · password · applications(W10 내 신청) — RequireAuth
app/events/     page(W8 목록) · [id]/page(W9 상세) · [id]/not-found — 서버 렌더
components/     화면 조각(폼 · 모달 · 문지기 · 머리글). 공용 입력 컴포넌트는 packages/ui
lib/            api(ApiClient) · public-api(서버 공개 조회, server-only) · auth(AuthProvider) · queries · schemas · errors · format
                applications(신청 영역 판정 · 신청 오류 문구) · next-path(로그인 뒤 돌아갈 주소)
```

## 실행 방법

```bash
pnpm --filter @oneul-sai/web dev
```

http://localhost:3000 에서 확인. Gateway(4000)와 member-service(4001)가 떠 있어야 가입 · 로그인이, event-service(4002)가 떠 있어야 일정이 보인다. 참가 신청은 event-service가 member-service를 부르므로 셋 다 떠 있어야 된다.

```bash
pnpm --filter @oneul-sai/web build      # next build
pnpm --filter @oneul-sai/web typecheck  # tsc --noEmit
pnpm --filter @oneul-sai/web lint       # eslint (eslint-config-next)
pnpm --filter @oneul-sai/web test       # vitest — lib/ 표시 도우미 · 신청 영역 판정 · next 검사 · 서버 공개 조회(TZ=UTC)
```

## 환경 변수

`.env.example`을 복사해 `.env.local` 생성:

| 변수                  | 설명             | 기본값                  |
| --------------------- | ---------------- | ----------------------- |
| `NEXT_PUBLIC_API_URL` | API Gateway 주소 | `http://localhost:4000` |

Gateway의 `CORS_ORIGINS`에 이 앱의 주소(기본 `http://localhost:3000`)가 있어야 쿠키가 실린다.
