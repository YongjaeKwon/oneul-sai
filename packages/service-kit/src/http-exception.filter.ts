import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { API_ERROR_CODES, type ApiErrorResponse } from '@oneul-sai/contracts';
import type { Request, Response } from 'express';
import { requestIdOf, requestPathname } from './api-error.js';

/** 앱이 넘기는 로거의 최소 모양 — `@oneul-sai/logger`의 `Logger`가 맞는다. */
export interface ErrorLogger {
  error(message: string, fields?: Record<string, unknown>): void;
}

/**
 * Gateway의 필터를 복사해 `code`를 얹은 것 (SPEC-001 10절 내부 구조). 서비스가 전역 필터로 등록한다.
 * `message`에 입력값을 되돌려 주지 않고, `path`는 query string을 뗀 pathname이다 (12절).
 * HttpException이 아닌 에러는 고정 문구의 500이다 — 원문 · 원인을 응답에 싣지 않는다.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger?: ErrorLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message = 'Internal server error';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        error = exception.name;
        message = body;
      } else {
        const record = body as Record<string, unknown>;
        error =
          typeof record.error === 'string' ? record.error : exception.name;
        message = Array.isArray(record.message)
          ? record.message.join(', ')
          : typeof record.message === 'string'
            ? record.message
            : exception.message;
        code = typeof record.code === 'string' ? record.code : undefined;
      }
    }

    if (!(exception instanceof HttpException)) {
      // @Catch()가 모든 예외를 받으므로 Nest 기본 로거가 돌지 않는다 — 여기서 남기지 않으면 흔적이 없다.
      this.logger?.error('unhandled_error', {
        requestId: requestIdOf(request),
        path: requestPathname(request),
        errorName:
          exception instanceof Error ? exception.name : typeof exception,
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    const payload: ApiErrorResponse = {
      statusCode,
      error,
      message,
      ...(code !== undefined ? { code } : {}),
      path: requestPathname(request),
      requestId: requestIdOf(request),
      timestamp: new Date().toISOString(),
    };

    if (code === API_ERROR_CODES.SERVICE_BUSY) {
      response.setHeader('Retry-After', '1');
    }
    response.status(statusCode).json(payload);
  }
}
