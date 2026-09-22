# @oneul-sai/admin

오늘사이 운영자 웹(관리자 콘솔)입니다. Next.js 16(App Router) + Tailwind 4 + TanStack Query + React Hook Form으로 만들며, API 호출은 `@oneul-sai/api-client`로 Gateway(4000)만 부릅니다.

## 화면 (SPEC-001 4절 "운영자 웹")

| 경로            | 화면         | 설명                                                                                                                                                                                                |
| --------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`        | A1 로그인    | 이메일 · 비밀번호. `client: 'ADMIN'`으로 로그인하며 역할이 ADMIN이 아니면 "운영자 계정이 아닙니다."(세션을 남기지 않음). 백오프로 응답이 늦어지면 버튼을 잠근 채 기다린다                           |
| `/members`      | A2 회원 목록 | 검색어(이메일 · 이름 부분 일치, 휴대폰 앞자리 일치), 상태 · 역할 필터, 페이지네이션. 조건은 URL query string에 둔다                                                                                 |
| `/members/[id]` | A3 회원 상세 | 프로필 전체, 동의 시각, 로그인 실패 횟수 · 마지막 실패 시각(읽기 전용), 현재 상태와 사유. "정지" / "정지 해제" + 사유 입력 + 확인 → 상태 변경. 탈퇴 회원은 익명화된 값만 보이고 상태를 바꿀 수 없다 |
| `/`             | —            | `/members`로 보낸다                                                                                                                                                                                 |

- 보호 화면(`app/(protected)/`)은 `RequireAdmin`이 감싼다. 부팅 때 `POST /api/v1/auth/refresh { client: 'ADMIN' }`을 한 번 호출해 access token을 복구하고, 실패(400 · 401 · 403)면 `/login`으로 보낸다. 보호 조회가 401을 받으면 어떤 코드든 로그아웃 상태로 본다.
- access token은 `lib/api.ts`의 `ApiClient` 인스턴스 메모리에만 있다. refresh 토큰은 httpOnly 쿠키 `onulsai_rt_admin`이며 화면 코드는 읽지 않는다.
- 보호 데이터는 모두 클라이언트 컴포넌트에서 TanStack Query(`lib/queries.ts`)로 가져온다. 서버 컴포넌트 · Route Handler는 Gateway를 부르지 않는다.
- 에러 문구는 `lib/errors.ts`가 `ApiErrorResponse.code`로만 고른다(서버 `message`는 쓰지 않는다).
- 상태 배지(`Badge`) · 구분선(`Divider`) · 입력(`Input` · `Label` · `FieldError`)은 `@oneul-sai/ui`. 색 · 글꼴은 `docs/design/design-foundation.md`의 토큰만 쓴다.

## 실행

```bash
pnpm --filter @oneul-sai/admin dev
```

- 개발 서버: http://localhost:3001
- 로그인이 되려면 Gateway(4000)와 member-service(4001)가 떠 있어야 하고, 이 앱의 주소가 member-service의 `ADMIN_ORIGIN`(기본 `http://localhost:3001`)과 같고 Gateway의 `CORS_ORIGINS`에도 들어 있어야 한다. 아니면 로그인 · refresh가 403 `ORIGIN_NOT_ALLOWED`다.
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
components/                      화면 컴포넌트(모두 클라이언트) — login-screen, member-list-screen, member-detail-screen, member-status-form …
lib/
  api.ts            ApiClient 인스턴스(client: 'ADMIN', credentials: 'include')
  auth-provider.tsx AuthProvider · useAuth · useEndSessionOn401
  queries.ts        useMemberList · useMember · useUpdateMemberStatus
  errors.ts         에러 코드 → 화면 문구
  format.ts         상태 · 역할 · 성별 표기, 날짜 · 휴대폰 포맷
  member-list-filters.ts  URL query string ↔ 검색 조건
```

## 기타

- `lint` / `typecheck` / `build` 스크립트는 루트 turbo 태스크로도 실행됩니다.
