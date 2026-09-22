import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiErrorResponse } from '@oneul-sai/contracts';
import type { Request, Response } from 'express';
import { requestId } from '../http/api-error.js';
import { requestPathname } from '../http/request-path.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message = 'Internal server error';

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
      }
    }

    // path는 query string을 뗀 pathname이다 — 운영자 검색어(PII)가 응답에 남지 않게 (SPEC-001 12절).
    const payload: ApiErrorResponse = {
      statusCode,
      error,
      message,
      path: requestPathname(request),
      requestId: requestId(request),
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(payload);
  }
}
