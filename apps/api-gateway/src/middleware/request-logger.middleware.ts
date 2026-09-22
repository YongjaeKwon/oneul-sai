import { HEADER_REQUEST_ID, SERVICE_NAMES } from '@oneul-sai/constants';
import { createLogger } from '@oneul-sai/logger';
import type { NextFunction, Request, Response } from 'express';
import { requestPathname } from '../http/request-path.js';

const logger = createLogger({ service: SERVICE_NAMES.apiGateway });

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startedAt = Date.now();
  const requestIdHeader = req.headers[HEADER_REQUEST_ID];
  const requestId = Array.isArray(requestIdHeader)
    ? requestIdHeader[0]
    : requestIdHeader;
  // query string은 남기지 않는다 — 운영자 검색어(`?query=010...`)가 PII다 (SPEC-001 12절).
  // 헤더는 어떤 것도 남기지 않는다 — Cookie(refresh 토큰 원문) · Authorization · x-internal-token이 지나간다.
  const path = requestPathname(req);

  res.on('finish', () => {
    logger.info('request completed', {
      method: req.method,
      path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      requestId,
    });
  });

  next();
}
