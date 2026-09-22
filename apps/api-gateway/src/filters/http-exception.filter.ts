import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import type { ApiErrorResponse } from '@oneul-sai/contracts';
import type { Request, Response } from 'express';

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
        error = typeof record.error === 'string' ? record.error : exception.name;
        message = Array.isArray(record.message)
          ? record.message.join(', ')
          : typeof record.message === 'string'
            ? record.message
            : exception.message;
      }
    }

    const requestIdHeader = request.headers[HEADER_REQUEST_ID];
    const payload: ApiErrorResponse = {
      statusCode,
      error,
      message,
      path: request.originalUrl,
      requestId: typeof requestIdHeader === 'string' ? requestIdHeader : 'unknown',
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(payload);
  }
}
