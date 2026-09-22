import { SERVICE_NAMES } from '@oneul-sai/constants';
import { createLogger, type Logger } from '@oneul-sai/logger';
import type { NextFunction, Request, Response } from 'express';
import {
  ORIGIN_NOT_ALLOWED,
  requestId,
  sendApiError,
} from '../http/api-error.js';
import { requestPathname } from '../http/request-path.js';
import { matchesPathPrefix } from '../proxy/path-filter.js';

const defaultLogger = createLogger({ service: SERVICE_NAMES.apiGateway });

const ORIGIN_CHECKED_PREFIX = '/api/v1/auth';

export interface OriginCheckOptions {
  /** env `CORS_ORIGINS` */
  allowedOrigins: readonly string[];
  logger?: Logger;
}

/** `POST /api/v1/auth/*` (SPEC-001 7절 6번). 로그인 · refresh · 로그아웃 · 비밀번호 변경 · 모든 기기 로그아웃. */
export function isOriginCheckedRoute(
  method: string,
  pathname: string,
): boolean {
  return (
    method === 'POST' && matchesPathPrefix(pathname, ORIGIN_CHECKED_PREFIX)
  );
}

/**
 * `Origin` 헤더가 있는 `POST /api/v1/auth/*`는 그 값이 `CORS_ORIGINS`에 있을 때만 통과시킨다 (SPEC-001 7절 6번).
 * CORS는 응답 열람만 막고 요청 자체는 막지 않으므로, 다른 사이트의 form 제출이 로그인 · 로그아웃에 닿지 못하게
 * 하는 Gateway 쪽 장치다. `Origin`이 없는 비브라우저 호출은 그대로 둔다. 거부한 origin 값은 로그에 남기지 않는다(14절).
 */
export function createOriginCheckMiddleware(
  options: OriginCheckOptions,
): (req: Request, res: Response, next: NextFunction) => void {
  const allowed = new Set(options.allowedOrigins);
  const logger = options.logger ?? defaultLogger;

  return (req, res, next) => {
    const path = requestPathname(req);
    if (!isOriginCheckedRoute(req.method, path)) {
      next();
      return;
    }

    const origin = req.headers.origin;
    if (origin === undefined || allowed.has(origin)) {
      next();
      return;
    }

    logger.warn('gateway.auth.rejected', {
      code: ORIGIN_NOT_ALLOWED,
      path,
      requestId: requestId(req),
    });
    sendApiError(req, res, {
      statusCode: 403,
      error: 'Forbidden',
      code: ORIGIN_NOT_ALLOWED,
      message: '허용되지 않은 출처의 요청입니다.',
    });
  };
}
