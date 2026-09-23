# @oneul-sai/service-kit

NestJS 서비스가 함께 쓰는 플랫폼 코드. 게이트웨이가 보낸 요청인지(내부 토큰) 확인하고, 호출자 헤더와 역할을 확인하고, 요청을 Zod로 검사하고, 에러 응답을 `ApiErrorResponse`(+`code`) 형식으로 맞춘다. 업무 규칙은 담지 않는다. 결정과 근거는 [ADR-010](../../docs/adr/ADR-010-platform-packages.md), 설계는 [SPEC-002](../../docs/specs/SPEC-002-meetup-schedule.md) 7절 "서비스 플랫폼 코드"(D10).

## 편입 기준

ADR-010과 같은 문장이다. 이 패키지에 코드를 더하기 전에 네 가지를 모두 확인한다.

1. DB · Prisma를 쓰지 않는다 — `eslint.config.js`의 `no-restricted-imports`가 `@prisma/*`를 막는다.
2. env를 읽지 않는다 — 값은 앱이 생성자 · 팩토리로 넘긴다.
3. contracts가 정한 인증 헤더 프로토콜(`MemberRole` 포함) 밖의 도메인 enum을 import하거나 도메인 에러 코드로 분기하지 않는다.
4. 한 서비스만 쓰는 코드(예: `caller-status`)는 넣지 않는다 — 두 서비스 이상이 같은 동작을 요구할 때만 옮긴다.

1 · 2는 ESLint가 막는다(`@prisma/*` · `prisma` import, `process.env`). 3 · 4는 리뷰에서 확인한다.

## 내보내는 것

| 파일                             | export                                                                               | 역할                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/internal-auth.guard.ts`     | `InternalAuthGuard`, `safeEqual`, `parseCallerHeaders`, `INTERNAL_AUTH_EXEMPT_PATHS` | 전역 가드. `/health`(정확히 일치)를 뺀 모든 핸들러에서 `x-internal-token`을 먼저 확인 → 401 `INTERNAL_TOKEN_INVALID`. `@Public()`이 아니면 `x-user-*` 확인 |
| `src/roles.guard.ts`             | `RolesGuard`                                                                         | `@Roles(...)`와 호출자 역할 대조 → 403 `FORBIDDEN`. `InternalAuthGuard` 뒤에 등록한다                                                                      |
| `src/public.ts` · `roles.ts`     | `Public` · `IS_PUBLIC_KEY`, `Roles` · `ROLES_KEY`                                    | 메타데이터 키 `oneul-sai:isPublic` · `oneul-sai:roles`. 어느 엔드포인트가 공개인지의 원천                                                                  |
| `src/current-user.ts`            | `CurrentUser`, `CallerUser`, `RequestWithUser`                                       | 보호 핸들러의 호출자(`InternalAuthGuard`가 채운다)                                                                                                         |
| `src/zod-validation.pipe.ts`     | `ZodValidationPipe`, `formatIssues`                                                  | 400 `VALIDATION_FAILED`. message는 `issue.path` · `issue.code`만의 고정 문구(입력값 없음)                                                                  |
| `src/api-error.ts`               | `ApiHttpException`, `apiError`, `requestPathname`, `requestIdOf`, `ApiErrorBody`     | `code`가 붙은 HTTP 예외, query 없는 pathname, `x-request-id`                                                                                               |
| `src/http-exception.filter.ts`   | `HttpExceptionFilter`                                                                | 전역 필터. `ApiErrorResponse`(+`code`), `path`는 query 없음, `SERVICE_BUSY` → `Retry-After: 1`, 예상 밖 에러는 고정 문구 500                               |
| `src/json-content-type.guard.ts` | `JsonContentTypeGuard`, `isJsonContentType`                                          | 본문 경로(POST · PATCH)는 `Content-Type: application/json`만 → 아니면 400                                                                                  |
| `src/request-id.decorator.ts`    | `RequestId`                                                                          | 핸들러 인자로 `x-request-id`(없으면 `'unknown'`)                                                                                                           |

## 쓰는 법

```ts
// app.module.ts — 전역 가드는 등록 순서대로 돈다. 내부 토큰 값은 앱이 넘긴다(이 패키지는 env를 읽지 않는다).
import { APP_GUARD, Reflector } from '@nestjs/core';
import { InternalAuthGuard, RolesGuard } from '@oneul-sai/service-kit';
import { env } from './env.js';

providers: [
  {
    provide: APP_GUARD,
    useFactory: (reflector: Reflector) =>
      new InternalAuthGuard(reflector, env.INTERNAL_API_TOKEN),
    inject: [Reflector],
  },
  { provide: APP_GUARD, useClass: RolesGuard },
];

// app.ts
app.useGlobalFilters(new HttpExceptionFilter());
```

## 내부 토큰 검사의 예외

`INTERNAL_AUTH_EXEMPT_PATHS = ['/health']`. 요청 경로(query 앞)가 이 값과 **글자 그대로 같을 때만** 검사를 건너뛴다. 대소문자 · 끝 `/` · 점 세그먼트가 하나라도 다르면 검사한다(fail closed) — Express 5 라우터는 대소문자를 구분하지 않아 `/API/V1/...`도 `/api/v1/...` 핸들러로 가기 때문이다(SPEC-002 12절). Swagger(`/docs` · `/docs-json`)는 `SwaggerModule.setup`이 HTTP 어댑터에 직접 붙여 Nest 가드를 거치지 않으므로 목록에 없다.

## 의존성 규칙

- `@nestjs/common` · `@nestjs/core` · `reflect-metadata` · `rxjs`는 `peerDependencies`다. 앱과 이 패키지가 **같은 Nest 인스턴스**를 써야 한다 — 두 벌이 로드되면 `RolesGuard`의 `Reflector` 주입이 앱의 `Reflector`와 다른 클래스를 찾아 부팅이 실패한다([tech-stack 함정 10](../../docs/architecture/tech-stack.md)). 버전 범위는 앱과 같게 둔다.
- workspace 의존은 `@oneul-sai/contracts`(헤더 이름 · 에러 코드 · 역할), `@oneul-sai/constants`(`x-request-id`), `@oneul-sai/config`(`z` 타입만)다.
- `exports`는 `dist`를 가리킨다. 서비스를 빌드 · 테스트하기 전에 이 패키지가 빌드돼 있어야 한다(루트 `pnpm build` · `pnpm test`는 Turborepo `^build`가 처리한다).

## 명령

```bash
pnpm --filter @oneul-sai/service-kit build       # tsc -p tsconfig.build.json → dist
pnpm --filter @oneul-sai/service-kit typecheck
pnpm --filter @oneul-sai/service-kit lint
pnpm --filter @oneul-sai/service-kit test        # vitest, 가드 · 파이프 · 필터 단위 테스트
```

단위 테스트는 소스 옆 `*.spec.ts`이고, 가짜 요청 · 응답 · `ExecutionContext`는 `src/testing/fakes.ts`에 있다(빌드에서 제외).
