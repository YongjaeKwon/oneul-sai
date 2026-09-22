# @oneul-sai/contracts

서비스 간 API/Event 계약만 정의하는 패키지. 비즈니스 로직은 두지 않는다.

## 구조

| 경로          | 내용                                                                                                                                                                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/http/`   | `ApiErrorResponse`(공통 에러 응답, `code?` 포함), `API_ERROR_CODES` · `ApiErrorCode`(SPEC-001 에러 코드 표)                                                                                                                                                                                                            |
| `src/member/` | `Gender` · `MemberRole` · `AccountStatus` enum, 필드 규칙(`EmailSchema` · `PasswordSchema` · `PhoneSchema` …), 요청(`SignupRequest` · `UpdateMyProfileRequest` · `WithdrawRequest` · `MemberListQuery` · `UpdateMemberStatusRequest`), 응답(`MemberProfile` · `MemberSummary` · `MemberDetail` · `MemberListResponse`) |
| `src/auth/`   | `ClientType`, 요청(`LoginRequest` · `RefreshRequest` · `LogoutRequest` · `ChangePasswordRequest`), 응답(`AuthResponse`), refresh 쿠키 이름 · 경로, JWT 고정 클레임, 내부 헤더 이름(`x-user-id` · `x-user-role` · `x-internal-token`)                                                                                   |
| `src/events/` | `EventEnvelope`                                                                                                                                                                                                                                                                                                        |

스키마는 Zod v4. 이름은 설계서 7절의 필드 표와 같고, 각 스키마 `XxxSchema`에 `type Xxx = z.infer<...>`가 붙는다. 서비스는 `ZodValidationPipe`로 요청 스키마를 실행하고, 앱은 같은 스키마를 폼 검증(`zodResolver`)에 쓴다.

## 계약 규칙

- Producer/Consumer가 임의 payload를 만들지 않는다. 이 패키지에 정의된 계약 타입만 사용한다.
- 요청 스키마는 모두 `strictObject`다 — 모르는 필드는 400 `VALIDATION_FAILED`. 에러 message에 입력값을 되돌려 주지 않는다.
- 스키마가 거르지 않고 서비스가 별도 코드로 판정하는 규칙이 있다: 가입 연령(`birthYear ≤ 현재 연도 − SIGNUP_MIN_AGE` → `AGE_NOT_ALLOWED`), 필수 동의(`consents.privacy === true` → `CONSENT_REQUIRED`). 스키마는 형식(하한 · 타입)만 본다.
- refresh · logout 본문의 `client`가 어느 쿠키(`REFRESH_COOKIE_NAMES[client]`)를 읽을지 정한다. 두 쿠키가 함께 있어도 오류가 아니다.
- 이벤트 이름은 `domain.event` 형식을 따르고, `EventEnvelope`의 `version` 필드로 버저닝한다. topic은 `match.created.v1` 형태를 쓴다.
- 초기 이벤트 후보 목록은 아래와 같고, 실제 구현 시점에만 타입으로 추가한다.
  - `member.created` / `member.withdrawn`
  - `application.created` / `application.accepted` / `application.cancelled`
  - `payment.completed` / `payment.failed` / `payment.cancelled`
  - `event.started` / `event.completed`
  - `rotation.started` / `rotation.changed` / `rotation.completed`
  - `preference.submitted`
  - `match.created`
