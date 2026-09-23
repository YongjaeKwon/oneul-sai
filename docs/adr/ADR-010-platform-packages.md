# ADR-010 플랫폼 패키지(logger · config · service-kit): 업무 규칙 없는 서버 공통 코드는 공유 패키지로 둔다

- 날짜: 2026-09-23
- 상태: Accepted
- 관련 설계서: [SPEC-002 소개팅 상품/일정](../specs/SPEC-002-meetup-schedule.md) (0.1절 리드 결정 기록 D10, 7절 "서비스 플랫폼 코드", 12절 "내부 토큰 검사의 예외")
- 관련 ADR: [ADR-004 서비스 경계](./ADR-004-service-boundary.md), [ADR-009 인증 방식](./ADR-009-authentication.md)

## Context

CLAUDE.md 원칙 4는 "공유 패키지에 비즈니스 로직 금지 — 서비스 간 공유는 `@oneul-sai/contracts`(스키마 · 타입)만"이라고 적는다. 그러나 모든 서비스는 이미 `@oneul-sai/logger`(구조화 로그)와 `@oneul-sai/config`(env 검증)를 함께 쓴다. 이 둘은 업무 데이터의 형식도 업무 규칙도 담지 않는 도구 패키지라 문제가 된 적은 없지만, 원칙 문구는 이 구분을 적지 않았다.

Step 2에서 두 번째 API 서비스(event-service)가 생긴다. event-service는 member-service와 **같은 인증 신뢰 규칙**을 집행해야 한다(ADR-009 결정 3, SPEC-001 7절 "내부 신뢰 규칙"): 내부 토큰(`x-internal-token`) 비교, 내부 헤더(`x-user-id` · `x-user-role`) 형식 검증, `@Public()` · `@Roles()` 판정, Zod 요청 검증과 입력값 없는 400 문구, `ApiErrorResponse`(+`code`) 형식의 에러 응답, 본문 경로의 `Content-Type: application/json` 확인. 지금 이 코드는 member-service의 `src/` 안에 있고, SPEC-001 16절은 "예외 필터 · Zod 파이프 · 가드의 공용 패키지화"를 "Step 2(두 번째 서비스 구현 시)"로 미뤄 두었다.

같은 시점에 보안 리뷰가 이 코드의 결함 하나를 찾았다. `InternalAuthGuard`는 pathname이 `/api/v1/`로 시작하지 않으면 내부 토큰 검사를 통째로 건너뛰는데, Express 5 라우터는 경로 대소문자를 구분하지 않아 `GET /API/V1/members/me`가 `/api/v1/members/me` 핸들러로 간다. 서비스 포트에 직접 붙으면 `@Public()` 핸들러에 내부 토큰 없이 닿고, member-service의 `POST /API/V1/auth/login`은 Gateway의 IP rate limit와 `Origin` 확인을 우회한다(SPEC-002 12절).

## Decision

**1. 플랫폼 패키지는 업무 규칙 없이 서비스 간에 공유한다.** 플랫폼 패키지는 `@oneul-sai/logger`, `@oneul-sai/config`, 그리고 새 `@oneul-sai/service-kit`이다. 서비스끼리 업무 데이터의 형식(스키마 · 타입 · 에러 코드 값)을 공유하는 곳은 여전히 `@oneul-sai/contracts` 하나다. 플랫폼 패키지는 contracts가 정한 프로토콜(헤더 이름, 에러 형식, 코드 값)을 **집행**할 뿐 새 규칙을 정하지 않는다.

**2. `@oneul-sai/service-kit`을 만든다.** member-service의 플랫폼 코드 — `InternalAuthGuard`(+ `safeEqual` · `parseCallerHeaders` · `INTERNAL_AUTH_EXEMPT_PATHS`), `@Public` · `IS_PUBLIC_KEY`, `@Roles` · `ROLES_KEY`, `RolesGuard`, `@CurrentUser` · `CallerUser` · `RequestWithUser`, `ZodValidationPipe` · `formatIssues`, `ApiHttpException` · `apiError` · `requestPathname` · `requestIdOf`, `HttpExceptionFilter`, `JsonContentTypeGuard` · `isJsonContentType`, `@RequestId` — 를 이 패키지로 옮긴다. 공개 API 이름 · 메타데이터 키 문자열 · 에러 코드 · 문구는 그대로다. member-service와 event-service가 이 패키지를 import한다. 도메인 코드(`cookies`, `caller-status`, `mask`, `password*`, 로그인 백오프, 토큰)는 member-service에 남는다.

**3. 편입 기준.** 아래 네 문장은 `packages/service-kit/README.md`에 같은 문장으로 적는다.

1. DB · Prisma를 쓰지 않는다 — `eslint.config.js`의 `no-restricted-imports`가 `@prisma/*`를 막는다.
2. env를 읽지 않는다 — 값은 앱이 생성자 · 팩토리로 넘긴다.
3. contracts가 정한 인증 헤더 프로토콜(`MemberRole` 포함) 밖의 도메인 enum을 import하거나 도메인 에러 코드로 분기하지 않는다.
4. 한 서비스만 쓰는 코드(예: `caller-status`)는 넣지 않는다 — 두 서비스 이상이 같은 동작을 요구할 때만 옮긴다.

**4. 패키지 형태.** `"type": "module"`, `tsc` 빌드 → `dist`, `exports`는 `dist`를 가리킨다(contracts · logger와 같다). `@nestjs/common` · `@nestjs/core` · `reflect-metadata` · `rxjs`는 `peerDependencies`다 — 앱과 kit이 같은 Nest 인스턴스를 써야 한다(`docs/architecture/tech-stack.md` 함정 10). 내부 토큰 값은 앱이 `APP_GUARD`의 `useFactory`로 `new InternalAuthGuard(reflector, env.INTERNAL_API_TOKEN)`처럼 넘긴다.

**5. 내부 토큰 검사의 예외는 정확히 일치하는 허용 목록이다.** 예외를 "pathname이 `/api/v1/`로 시작하지 않으면 통과"에서 `INTERNAL_AUTH_EXEMPT_PATHS = ['/health']`와 **글자 그대로 같은** 요청 경로(query 앞)만 통과로 바꾼다. 그 밖의 모든 핸들러는 경로 대소문자 · 형식과 무관하게 내부 토큰을 검사한다(fail closed). Swagger(`/docs` · `/docs-json`)는 `SwaggerModule.setup`이 HTTP 어댑터에 직접 붙이는 경로라 Nest 가드를 거치지 않으므로 목록에 넣지 않는다(2026-09-23 member-service로 확인, SPEC-002 17절). 이것은 ADR-009 결정 3("`/health` · `/docs` 제외")의 구현 결함 수정이며 신뢰 모델의 변경이 아니다.

**6.** CLAUDE.md 원칙 4와 9장의 `packages/*` 항목은 이 ADR을 근거로 "플랫폼 패키지(logger · config · service-kit)는 업무 규칙 없이 공유한다"를 더한다.

## Reason

**인증 신뢰 규칙이 두 벌이면 보안 수정이 한쪽에만 들어간다.** ADR-009 신뢰 모델의 서비스 쪽 절반(내부 토큰 비교 · 헤더 검증 · 역할 판정)을 event-service에 복사하면, 이번 내부 토큰 예외 결함 같은 수정을 모든 복사본에 똑같이 넣어야 한다. 한 곳을 빠뜨리면 그 서비스만 조용히 열린다. 한 패키지에 두면 수정 한 번과 그 패키지의 단위 테스트 한 벌로 모든 서비스가 같은 결과를 얻는다.

**이 코드는 도구이지 업무 규칙이 아니다.** 가드 · 파이프 · 필터가 판단하는 것은 "Gateway가 보낸 요청인가", "헤더 형식이 맞는가", "역할이 허용 목록에 있는가", "응답이 계약 형식인가"뿐이다. 정원 계산 · 매칭 판별 · 결제 상태 전이 같은 도메인 판단(CLAUDE.md 9장)은 하나도 없고, 판단 기준(헤더 이름, 역할 값, 에러 코드)은 모두 contracts에서 온다. logger · config와 같은 부류이며, 원칙 4가 막으려던 것(서비스 경계를 넘는 업무 로직 공유)과 다르다.

**편입 기준이 없으면 범위가 슬금슬금 넓어진다.** "여러 서비스가 쓰니까"는 거의 모든 코드에 붙일 수 있는 이유다. DB 접근이나 env 읽기가 섞이면 kit이 서비스의 설정 · 저장소에 묶이고, 도메인 enum이 섞이면 kit을 고칠 때마다 도메인 리뷰가 필요해진다. 기계로 막을 수 있는 두 가지(Prisma import, `process.env`)는 ESLint 규칙으로 막고, 나머지 두 가지는 README와 리뷰로 지킨다.

**추출하면서 결함을 고친다.** "동작 불변" 추출로 끝내면 결함이 모든 서비스가 쓰는 코드에 굳고, 다음 PR 사이에 event-service가 같은 결함을 얻는다. prefix 비교는 "무엇을 예외로 둘지"를 열린 목록(`/api/v1/`로 시작하지 않는 모든 것)으로 남기므로, 대소문자 구분을 켜는 것보다 정확한 허용 목록이 fail closed다. 비교 대상은 라우터가 매칭하는 것과 같은 query 앞 요청 경로이고, URL 정규화(점 세그먼트 해석 등)를 하지 않는다 — 정규화한 값으로 판정하면 라우터가 실제로 고른 경로와 다른 경로를 보고 예외를 줄 수 있다.

**Nest는 peer로 둔다.** kit이 자기 `@nestjs/core`를 따로 가지면 `RolesGuard`의 `Reflector` 주입(`useClass`)이 앱의 `Reflector`와 다른 클래스를 찾아 부팅이 실패하고, `HttpException` `instanceof` 판정도 어긋난다. pnpm은 같은 버전 범위의 peer를 한 인스턴스로 연결한다.

## Trade-offs

- **kit 변경은 모든 서비스에 한 번에 퍼진다.** 버그도 함께 퍼진다. kit의 단위 테스트와 각 서비스의 통합 테스트(실제 앱을 띄워 가드 · 필터를 지난다)가 이를 받친다. CI는 PR마다 모든 workspace의 테스트를 돈다.
- **빌드 순서가 생긴다.** kit의 `exports`가 `dist`를 가리키므로 서비스를 빌드 · 테스트하기 전에 kit이 빌드돼 있어야 한다. Turborepo의 `^build` 의존이 루트 명령에서 이를 처리하고, `turbo prune`은 kit을 서비스 이미지에 포함한다. turbo 밖에서 직접 부르는 `test:integration`(CI `integration` 잡)은 의존 패키지 빌드 단계가 따로 필요하다(SPEC-002 15절 4번 PR).
- **편입 기준 3 · 4는 기계로 막지 않는다.** 도메인 enum import나 한 서비스 전용 코드는 리뷰에서만 걸러진다.
- **되돌리기가 보안 수정을 함께 되돌린다.** 추출 PR을 revert하면 내부 토큰 예외 수정도 사라진다. 문제가 kit 구조에 있다면 revert 대신 가드 수정을 남기는 forward fix를 먼저 고려한다(SPEC-002 15절).
- **Swagger는 서비스 포트에서 토큰 없이 열린다.** 이전과 같다. 핸들러가 아니라 API 문서만 보이며, 서비스 포트를 외부에 열지 않는 네트워크 규칙(ADR-009 Trade-offs)에 기댄다.

## Alternatives

**event-service에 복사하고 세 번째 서비스(payment, Step 4)에서 추출 — 기각.** 지금 패키지를 만들지 않아도 되지만, 인증 신뢰 규칙이 두 벌이 되어 보안 수정이 한쪽에만 들어갈 위험이 Step 4까지 남는다. 이번 내부 토큰 예외 결함이 바로 그런 수정이다.

**contracts에 넣기 — 기각.** contracts는 프론트엔드(`api-client`, web, admin)도 소비한다. 가드 · 필터를 넣으면 contracts가 NestJS · Express 타입에 의존하게 되고, "업무 데이터 형식만"이라는 contracts의 경계가 흐려진다.

**내부 토큰 예외를 prefix로 두고 `case sensitive routing`을 켜 대소문자만 막기 — 기각.** 변경이 가장 작지만 무엇을 예외로 두는가가 열린 목록으로 남는다. 새 경로 모양(다른 prefix, 인코딩된 경로)이 생길 때마다 다시 검토해야 한다.

**추출은 "동작 불변"으로 끝내고 가드 수정은 별 PR — 기각.** 추출 PR이 결함을 공용 코드에 한 번 굳히고, 두 PR 사이에 event-service가 같은 결함을 얻는다.
