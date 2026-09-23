# @oneul-sai/admin

오늘사이 운영자 웹(관리자 콘솔)입니다. Next.js 16(App Router) + Tailwind 4 + TanStack Query + React Hook Form으로 만들며, API 호출은 `@oneul-sai/api-client`로 Gateway(4000)만 부릅니다.

## 화면

### 회원 (SPEC-001 4절 "운영자 웹")

| 경로            | 화면         | 설명                                                                                                                                                                                                |
| --------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`        | A1 로그인    | 이메일 · 비밀번호. `client: 'ADMIN'`으로 로그인하며 역할이 ADMIN이 아니면 "운영자 계정이 아닙니다."(세션을 남기지 않음). 백오프로 응답이 늦어지면 버튼을 잠근 채 기다린다                           |
| `/members`      | A2 회원 목록 | 검색어(이메일 · 이름 부분 일치, 휴대폰 앞자리 일치), 상태 · 역할 필터, 페이지네이션. 조건은 URL query string에 둔다                                                                                 |
| `/members/[id]` | A3 회원 상세 | 프로필 전체, 동의 시각, 로그인 실패 횟수 · 마지막 실패 시각(읽기 전용), 현재 상태와 사유. "정지" / "정지 해제" + 사유 입력 + 확인 → 상태 변경. 탈퇴 회원은 익명화된 값만 보이고 상태를 바꿀 수 없다 |
| `/`             | —            | `/members`로 보낸다                                                                                                                                                                                 |

### 모임 상품 · 회차 (SPEC-002 4절 A4~A9, 헤더 메뉴 "모임 상품")

운영자가 말하는 "모임"은 한 번의 행사, 곧 **회차**다. 상품은 제목 · 설명만 갖고, 참가비 · 정원 · 연령대 · 장소는 회차마다 정한다.

| 경로                                         | 화면              | 설명                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/meetups`                                   | A4 상품 목록      | 제목 · 등록일(최신순), "상품 등록"                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/meetups/new`                               | A5 상품 등록      | 제목 · 설명 + "참가자에게 보입니다" 안내 → `POST /api/v1/meetups` → A6                                                                                                                                                                                                                                                                                                                                                                      |
| `/meetups/[meetupId]`                        | A6 상품 상세      | 위: 상품 수정(바꾼 필드만 `PATCH`, "30초 안에 반영" 안내). 아래: 회차 목록 — 상태 필터, 기간(기본 "오늘 이후", "지난 회차 포함"), 한 줄에 일시 · 지역 · 참가비 · 정원 · 남성 연령대 · 상태. DRAFT 행을 골라 "선택한 회차 공개(N)" → 확인 → 회차마다 `PATCH .../status { status: 'OPEN' }`을 **하나씩 차례로** 부르고 상태 줄 · 행별 결과를 보여 준다(401 · 403이면 멈춤). A9 뒤에는 `?registered=N`으로 "N개 회차를 비공개로 등록했습니다." |
| `/meetups/[meetupId]/schedules/new`          | A7 회차 만들기    | 미리 채운 값: 시작 = 다음 일요일 14:00(서울), 신청 마감 = 시작(손대기 전까지 시작을 따라감), 정원 7 · 7. 종료 · 참가비는 비워 둔다. "남녀 같은 금액"(기본 켜짐), 남성 연령대 두 칸 + "여성에게는 연령 조건이 없습니다", 지역(공개) + 장소 안내 네 칸(선택). 일요일이 아니거나 남녀 정원이 다르면 제출 전에 한 번 묻는다(경고만) → `POST` → A8                                                                                               |
| `/meetups/[meetupId]/schedules/[scheduleId]` | A8 회차 상세      | 상태 배지, 상태 버튼(DRAFT 공개 · 취소 · 삭제, OPEN 모집 마감 · 취소, CLOSED 다시 열기(신청 마감 전에만) · 취소), 취소 사유 모달, 삭제 확인. 수정 폼(바꾼 필드만 `PATCH`, 비운 칸은 `null`, 공개 중이면 "30초 안에 반영" 안내). CANCELLED는 읽기 전용 + 취소 사유. "확정자에게 보일 장소 안내" 미리보기 — 지도 링크는 `isAllowedVenueMapUrl`로 다시 검사해 통과할 때만 "지도 열기"(새 탭)                                                   |
| `/meetups/[meetupId]/schedules/batch`        | A9 여러 회차 등록 | 상품 선택 → 날짜("매주 반복" 첫 날짜 + 주 수 1~12, 또는 "날짜 직접 고르기") → 공통 값 한 번(시작 · 종료 시각, 신청 마감 "행사 N시간 전", 참가비 · 정원 · 연령대 · 장소) → 미리보기 표(행마다 고치기 · 빼기, 행 검사 · 중복 · 일요일 아님 표시) → "N개 회차 등록" 한 번에 `POST .../schedules/batch`. 400이면 아무것도 만들어지지 않았고 `message`의 `items.<순번>`을 그 행에 표시한다                                                       |

- 상태 배지: DRAFT "비공개"(neutral), OPEN "모집 중"(success), CLOSED "모집 마감"(neutral), CANCELLED "취소"(danger). OPEN이지만 신청 마감이 지난 회차는 "모집 마감" + "신청 마감 시각 지남 · 상태: 공개".
- 날짜 · 시간은 운영자 PC의 시간대와 무관하게 서울 시각으로 보이고, 입력값은 서울로 해석해 `+09:00`을 붙여 보낸다(`lib/format.ts`의 `toSeoulLocal` · `fromSeoulLocal`, 상수 `SERVICE_TIME_ZONE`).
- 폼은 contracts의 `CreateScheduleRequestSchema` · `CreateMeetupRequestSchema` 등으로 검사하고 시간 규칙(신청 마감 ≤ 시작 < 종료, 12시간, 지난 시각, 1년)을 제출 전에 칸 옆에 알려 준다. 판정의 원천은 서버다.
- 설명 · 찾아오는 길은 평문으로만 그린다(줄바꿈 유지, `dangerouslySetInnerHTML` 없음).

### 공통

- 보호 화면(`app/(protected)/`)은 `RequireAdmin`이 감싼다. 부팅 때 `POST /api/v1/auth/refresh { client: 'ADMIN' }`을 한 번 호출해 access token을 복구하고, 실패(400 · 401 · 403)면 `/login`으로 보낸다. 보호 조회가 401을 받으면 어떤 코드든 로그아웃 상태로 본다.
- access token은 `lib/api.ts`의 `ApiClient` 인스턴스 메모리에만 있다. refresh 토큰은 httpOnly 쿠키 `onulsai_rt_admin`이며 화면 코드는 읽지 않는다.
- 보호 데이터는 모두 클라이언트 컴포넌트에서 TanStack Query(`lib/queries.ts`)로 가져온다. 서버 컴포넌트 · Route Handler는 Gateway를 부르지 않는다.
- 에러 문구는 `lib/errors.ts`가 `ApiErrorResponse.code`로만 고른다(서버 `message`는 쓰지 않는다 — 여러 회차 등록이 `items.<순번>`으로 행을 찾는 것만 예외이고, 문구는 그때도 `code`로 고른다).
- 상태 배지(`Badge`) · 구분선(`Divider`) · 입력(`Input` · `Label` · `FieldError`)은 `@oneul-sai/ui`. 색 · 글꼴은 `docs/design/design-foundation.md`의 토큰만 쓴다. 화면 제목 아래에는 짧은 로즈 구분선(왼쪽 정렬), 날짜 숫자는 명조(`font-display tabular-nums`).

## 실행

```bash
pnpm --filter @oneul-sai/admin dev
```

- 개발 서버: http://localhost:3001
- 로그인이 되려면 Gateway(4000)와 member-service(4001)가 떠 있어야 하고, 이 앱의 주소가 member-service의 `ADMIN_ORIGIN`(기본 `http://localhost:3001`)과 같고 Gateway의 `CORS_ORIGINS`에도 들어 있어야 한다. 아니면 로그인 · refresh가 403 `ORIGIN_NOT_ALLOWED`다.
- 모임 상품 · 회차 화면은 event-service(4002)와 Gateway의 `/api/v1/meetups` 라우팅이 필요하다.
- 운영자 계정은 가입 화면으로 만들 수 없다(member-service seed 스크립트).

## 환경 변수

`.env.example`을 복사해 `.env.local`을 만들어 사용합니다.

| 변수                  | 설명             | 기본값                  |
| --------------------- | ---------------- | ----------------------- |
| `NEXT_PUBLIC_API_URL` | API Gateway 주소 | `http://localhost:4000` |

## 구조

```
app/
  layout.tsx · providers.tsx     글꼴 · QueryClient · AuthProvider
  login/page.tsx                 A1
  (protected)/layout.tsx         RequireAdmin + AdminHeader
  (protected)/members/page.tsx   A2
  (protected)/members/[id]/page.tsx  A3
  (protected)/meetups/page.tsx · new/page.tsx       A4 · A5
  (protected)/meetups/[meetupId]/page.tsx           A6
  (protected)/meetups/[meetupId]/schedules/new · [scheduleId] · batch   A7 · A8 · A9
components/                      화면 컴포넌트 — login-screen, member-*, meetup-*, schedule-*, dialog(<dialog> 모달), form-field, page-header …
lib/
  api.ts            ApiClient 인스턴스(client: 'ADMIN', credentials: 'include')
  auth-provider.tsx AuthProvider · useAuth · useEndSessionOn401
  queries.ts        회원 · 모임 상품 · 회차 조회와 변경(TanStack Query)
  errors.ts         에러 코드 → 화면 문구(describeError · describeEventError)
  format.ts         상태 · 역할 · 성별 표기, 날짜(서울) · 휴대폰 · 참가비 · 정원 · 남성 연령대 문구, 회차 상태 배지
  schedule-form.ts  회차 폼 값 ↔ 요청, 시간 규칙, 다음 일요일, 바꾼 필드(PATCH), 확인 문구
  schedule-batch.ts 매주 반복 날짜, "행사 N시간 전", 미리보기 행 검사, items.<순번> 추출, 여러 회차 차례로 공개
  member-list-filters.ts  URL query string ↔ 검색 조건
```

## 기타

- `lint` / `typecheck` / `build` 스크립트는 루트 turbo 태스크로도 실행됩니다.
