import { SERVICE_NAMES } from '@oneul-sai/constants';
import {
  API_ERROR_CODES,
  AccessTokenClaimsSchema,
  HEADER_INTERNAL_TOKEN,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
  INTERNAL_HEADER_PREFIX,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_TYP,
} from '@oneul-sai/contracts';
import { createLogger, type Logger } from '@oneul-sai/logger';
import type { NextFunction, Request, Response } from 'express';
import { errors, jwtVerify } from 'jose';
import { JWT_CLOCK_TOLERANCE_SECONDS } from '../auth/jwt.js';
import { requestId, sendApiError } from '../http/api-error.js';
import { requestPathname } from '../http/request-path.js';

const defaultLogger = createLogger({ service: SERVICE_NAMES.apiGateway });

const BEARER = /^Bearer\s+(\S+)$/i;

type RejectCode =
  typeof API_ERROR_CODES.UNAUTHENTICATED | typeof API_ERROR_CODES.TOKEN_EXPIRED;

export interface AuthMiddlewareOptions {
  /** HS256 키 바이트 (`decodeAccessSecret(env.JWT_ACCESS_SECRET)`) */
  secret: Uint8Array;
  logger?: Logger;
}

export type AuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

/**
 * 외부에서 온 내부 헤더를 모두 버린다 (SPEC-001 12절 "헤더 spoofing 방지").
 * `x-user-*`는 접두사로 지우므로 내부 헤더가 늘어도 목록을 빠뜨릴 수 없다. `x-internal-token`은 Gateway만 붙이므로 함께 버린다.
 */
export function stripInternalHeaders(req: Pick<Request, 'headers'>): void {
  for (const name of Object.keys(req.headers)) {
    if (
      name.startsWith(INTERNAL_HEADER_PREFIX) ||
      name === HEADER_INTERNAL_TOKEN
    ) {
      delete req.headers[name];
    }
  }
}

/**
 * SPEC-001 7절 "Gateway 라우팅 표 변경" 1~3번, ADR-009 결정 2.
 *
 * 1. 모든 요청에서 `x-user-*`를 지운다 (공개 · 보호 구분 없이).
 * 2. `Authorization: Bearer`가 있으면 검증한다. 실패 → 401 `UNAUTHENTICATED` | `TOKEN_EXPIRED`.
 *    성공 → `x-user-id` · `x-user-role`을 채우고 `Authorization`을 지운다.
 * 3. `Authorization`이 없으면 헤더 없이 그대로 통과시킨다. 보호 경로면 서비스가 401을 낸다.
 *    어느 경로가 인증을 요구하는지는 서비스의 `@Public()`이 원천이며 Gateway는 경로 · 역할을 판단하지 않는다.
 */
export function createAuthMiddleware(
  options: AuthMiddlewareOptions,
): AuthMiddleware {
  const logger = options.logger ?? defaultLogger;

  const reject = (req: Request, res: Response, code: RejectCode): void => {
    logger.warn('gateway.auth.rejected', {
      code,
      path: requestPathname(req),
      requestId: requestId(req),
    });
    sendApiError(req, res, {
      statusCode: 401,
      error: 'Unauthorized',
      code,
      message:
        code === API_ERROR_CODES.TOKEN_EXPIRED
          ? '액세스 토큰이 만료되었습니다.'
          : '인증 정보가 유효하지 않습니다.',
    });
  };

  return async (req, res, next) => {
    stripInternalHeaders(req);

    if (req.method === 'OPTIONS') {
      next();
      return;
    }

    const authorization = req.headers.authorization;
    if (authorization === undefined) {
      next();
      return;
    }

    const token = BEARER.exec(authorization)?.[1];
    if (token === undefined) {
      reject(req, res, API_ERROR_CODES.UNAUTHENTICATED);
      return;
    }

    try {
      const { payload } = await jwtVerify(token, options.secret, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        typ: JWT_TYP,
        clockTolerance: JWT_CLOCK_TOLERANCE_SECONDS,
      });

      // 형식 확인만 한다(`sub` UUID, `role`이 MemberRole). 역할로 무엇을 허용할지는 서비스가 정한다.
      const claims = AccessTokenClaimsSchema.safeParse(payload);
      if (!claims.success) {
        reject(req, res, API_ERROR_CODES.UNAUTHENTICATED);
        return;
      }

      req.headers[HEADER_USER_ID] = claims.data.sub;
      req.headers[HEADER_USER_ROLE] = claims.data.role;
      delete req.headers.authorization;
      next();
    } catch (error) {
      reject(
        req,
        res,
        error instanceof errors.JWTExpired
          ? API_ERROR_CODES.TOKEN_EXPIRED
          : API_ERROR_CODES.UNAUTHENTICATED,
      );
    }
  };
}
