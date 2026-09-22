import { HEADER_REQUEST_ID, SERVICE_NAMES } from '@oneul-sai/constants';
import { createLogger } from '@oneul-sai/logger';
import type { NextFunction, Request, Response } from 'express';

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

  res.on('finish', () => {
    logger.info('request completed', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      requestId,
    });
  });

  next();
}
