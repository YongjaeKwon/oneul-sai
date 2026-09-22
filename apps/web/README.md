# @oneul-sai/web

오늘사이 참가자 Web 앱 (Next.js 16 App Router, 포트 3000).

## 역할

- 참가자 대상 웹 화면 — 랜딩, 가입 · 로그인 · 내 프로필(SPEC-001), 추후 이벤트 · 매칭 화면
- `@oneul-sai/ui` 공용 컴포넌트와 `@oneul-sai/api-client`를 통해 API Gateway(4000)와 통신한다. 다른 서비스 포트를 직접 부르지 않는다.

## 화면 (SPEC-001 4절 "참가자 웹")

| 경로           | 화면                             | 비고                                                                                                           |
| -------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/`            | 랜딩                             | 머리글에 로그인 여부(로그인 · 가입하기 / 내 정보 · 로그아웃)                                                   |
| `/signup`      | W1 가입                          | 이메일 · 비밀번호 · 이름 · 성별 · 출생연도 · 휴대폰 · 동의 2개. 201이면 바로 로그인해 `/me`로                  |
| `/login`       | W2 로그인                        | `client: 'WEB'`. 다섯 번째 시도부터는 응답이 늦어지므로 버튼을 잠근 채 기다린다                                |
| `/me`          | W3 내 프로필 · W4 수정 · W6 탈퇴 | 휴대폰 · 마케팅 수신만 수정(휴대폰은 현재 비밀번호 필요). 로그아웃 · 모든 기기에서 로그아웃 · 탈퇴는 확인 모달 |
| `/me/password` | W5 비밀번호 변경                 | 204 뒤 현재 탭은 로그인 상태 유지                                                                              |

이미 로그인한 상태로 `/signup` · `/login`에 오면 `/me`로, 로그인하지 않고 `/me/*`에 오면 `/login`으로 보낸다.

## 인증 동작

- access token은 `lib/api.ts`의 `ApiClient` 인스턴스 메모리에만 있다(SPEC-001 D4). refresh 토큰은 httpOnly 쿠키 `onulsai_rt_web`이며 브라우저가 `credentials: 'include'`로 Gateway에 보낸다.
- 부팅 시 `AuthProvider`(`lib/auth.tsx`)가 `POST /api/v1/auth/refresh` `{ client: 'WEB' }`를 한 번 호출해 토큰을 채운다. 400 · 401 · 403이면 로그아웃 상태다. 판정이 끝날 때까지 보호 화면은 로딩을 보여 준다(`components/require-auth.tsx`).
- 보호 요청이 401 `TOKEN_EXPIRED`를 받으면 api-client가 refresh 뒤 한 번 재시도한다. refresh까지 실패하면 토큰이 비고 앱은 "로그인이 만료되었습니다"를 보여 준다.
- 보호 데이터는 모두 클라이언트 컴포넌트에서 TanStack Query로 조회한다(`lib/queries.ts`). 서버 컴포넌트 · Route Handler에서 Gateway를 부르지 않는다.
- 폼은 React Hook Form + `@hookform/resolvers/zod`이며 스키마는 `@oneul-sai/contracts`의 요청 스키마를 확장한다(`lib/schemas.ts` — 만 19세 · 필수 동의 · 비밀번호 확인 일치).
- 에러는 `ApiErrorResponse.code`로만 분기한다(`lib/errors.ts`). 문구는 SPEC-001 4절 · 7절.

## 구조

```
app/            layout(머리글 · 글꼴) · providers(QueryClient + AuthProvider) · page(랜딩)
app/(auth)/     signup · login — 로그인 상태면 /me로
app/me/         page(프로필) · password — RequireAuth
components/     화면 조각(폼 · 모달 · 문지기 · 머리글). 공용 입력 컴포넌트는 packages/ui
lib/            api(ApiClient) · auth(AuthProvider) · queries · schemas · errors · format
```

## 실행 방법

```bash
pnpm --filter @oneul-sai/web dev
```

http://localhost:3000 에서 확인. Gateway(4000)와 member-service(4001)가 떠 있어야 가입 · 로그인이 동작한다.

```bash
pnpm --filter @oneul-sai/web build      # next build
pnpm --filter @oneul-sai/web typecheck  # tsc --noEmit
pnpm --filter @oneul-sai/web lint       # eslint (eslint-config-next)
```

## 환경 변수

`.env.example`을 복사해 `.env.local` 생성:

| 변수                  | 설명             | 기본값                  |
| --------------------- | ---------------- | ----------------------- |
| `NEXT_PUBLIC_API_URL` | API Gateway 주소 | `http://localhost:4000` |

Gateway의 `CORS_ORIGINS`에 이 앱의 주소(기본 `http://localhost:3000`)가 있어야 쿠키가 실린다.
