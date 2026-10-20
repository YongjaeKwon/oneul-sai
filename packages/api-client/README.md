# @oneul-sai/api-client

앱(web · admin)이 Gateway(:4000)를 부르는 유일한 통로. fetch 래퍼이며 프레임워크에 묶이지 않는다. 계약 타입은 `@oneul-sai/contracts`에서 온다.

## 사용

```ts
import { ApiClient, ApiClientError } from '@oneul-sai/api-client';

export const apiClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  client: 'WEB', // admin은 'ADMIN'
  credentials: 'include', // refresh 쿠키(httpOnly)가 Gateway로 실리게
});

// 부팅: 쿠키로 access token 복구. 401이면 로그아웃 상태.
await apiClient.refresh().catch(() => null);

const me = await apiClient.getMe();
```

| 메서드                                                                                                                                                                                                                 | 경로                                                                                                               | 비고                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `signup(input)`                                                                                                                                                                                                        | `POST /api/v1/members`                                                                                             | 공개. 201이면 이어서 `login`                    |
| `login({ email, password })`                                                                                                                                                                                           | `POST /api/v1/auth/login`                                                                                          | 공개. `client`는 생성자 옵션. 성공 시 토큰 저장 |
| `refresh()`                                                                                                                                                                                                            | `POST /api/v1/auth/refresh`                                                                                        | 공개(쿠키). 400 · 401 · 403이면 토큰 비움       |
| `logout()`                                                                                                                                                                                                             | `POST /api/v1/auth/logout`                                                                                         | 공개(쿠키). 결과와 무관하게 토큰 비움           |
| `logoutAll()`                                                                                                                                                                                                          | `POST /api/v1/auth/logout-all`                                                                                     | 회원. 성공 시 토큰 비움                         |
| `changePassword(input)`                                                                                                                                                                                                | `POST /api/v1/auth/password`                                                                                       | 회원                                            |
| `getMe()` · `updateMe(input)` · `withdraw(input)`                                                                                                                                                                      | `GET · PATCH · DELETE /api/v1/members/me`                                                                          | 회원. 탈퇴 성공 시 토큰 비움                    |
| `listMembers(params)`(`ids`는 배열로 넘기면 쉼표로 이어 보낸다) · `getMember(id)` · `updateMemberStatus(id, input)`                                                                                                    | `GET /api/v1/members`, `GET /api/v1/members/:id`, `PATCH /api/v1/members/:id/status`                               | ADMIN                                           |
| `listPublicEvents(params)` · `getPublicEvent(id)`                                                                                                                                                                      | `GET /api/v1/events`, `GET /api/v1/events/:id`                                                                     | 공개(`auth: false`)                             |
| `listMeetups(params)` · `createMeetup(input)` · `getMeetup(meetupId)` · `updateMeetup(meetupId, input)`                                                                                                                | `GET · POST /api/v1/meetups`, `GET · PATCH /api/v1/meetups/:meetupId`                                              | ADMIN                                           |
| `listSchedules(meetupId, params)` · `createSchedule(meetupId, input)` · `createSchedulesBatch(meetupId, input)`                                                                                                        | `GET · POST /api/v1/meetups/:meetupId/schedules`, `POST .../schedules/batch`                                       | ADMIN                                           |
| `getSchedule` · `updateSchedule` · `updateScheduleStatus` · `deleteSchedule` (`meetupId, scheduleId[, input]`)                                                                                                         | `GET · PATCH · DELETE /api/v1/meetups/:meetupId/schedules/:scheduleId`, `PATCH .../status`                         | ADMIN                                           |
| `apply(scheduleId)` · `listMyApplications(params)` · `cancelMyApplication(applicationId)`                                                                                                                              | `POST · GET /api/v1/applications`, `PATCH /api/v1/applications/:applicationId/status`                              | MEMBER(SPEC-003)                                |
| `listScheduleApplications(meetupId, scheduleId, params)` · `inviteApplication(meetupId, scheduleId, applicationId)`(참가 가능 안내 `{ status: 'PENDING' }`) · `cancelApplication(meetupId, scheduleId, applicationId)` | `GET /api/v1/meetups/:meetupId/schedules/:scheduleId/applications`, `PATCH .../applications/:applicationId/status` | ADMIN(SPEC-003)                                 |
| `recordPayment({ applicationId, memberId, amount })` · `listPayments({ applicationIds })`(배열로 넘기면 쉼표로 이어 보낸다) · `refundPayment(paymentId, refundAmount)`                                                 | `POST · GET /api/v1/payments`, `PATCH /api/v1/payments/:paymentId/status`                                          | ADMIN(SPEC-004)                                 |

## 규칙 (SPEC-001 7절 "클라이언트")

- access token은 인스턴스 메모리에만 있다(`getAccessToken` · `setAccessToken` · `clearAccessToken`). 바뀌면 `onAccessTokenChange(listener)`로 알린다 — React는 `useSyncExternalStore`로 구독한다. refresh token은 코드가 만지지 않는다(httpOnly 쿠키).
- 가입 · 로그인 · refresh · 로그아웃 · 공개 일정 조회에는 `Authorization`을 붙이지 않는다(`auth: false`). 나머지는 메모리에 토큰이 있으면 붙인다.
- 보호 요청이 401 `TOKEN_EXPIRED`를 받으면 refresh를 **한 번** 호출하고 원래 요청을 **한 번** 재시도한다. 같은 탭에서 동시에 만료를 맞은 요청은 하나의 refresh를 공유한다(single-flight). 탭 사이의 경합은 서버의 유예 창이 흡수한다. refresh가 실패하면 토큰을 비우고 그 에러(`ApiClientError`, 예: 401 `REFRESH_TOKEN_REUSED`)를 던진다 — 앱은 로그아웃 상태로 전환한다.
- refresh · logout 본문에는 생성자 옵션의 `client`가 실린다. 서비스는 그 값이 가리키는 쿠키만 읽으므로 한 브라우저에 web · admin이 함께 로그인돼 있어도 서로 간섭하지 않는다.
- 에러는 `ApiClientError`(`status`, `code`, `body`). `code`는 `@oneul-sai/contracts`의 `API_ERROR_CODES` 값이며 화면 문구는 코드로만 분기한다.
- `onTokenExpired` 옵션을 주면 내장 refresh 대신 그 훅을 쓴다. `fetch` 옵션은 테스트용 주입 지점이다.
