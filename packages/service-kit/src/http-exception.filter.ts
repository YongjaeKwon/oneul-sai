import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import { API_ERROR_CODES, type ApiErrorResponse } from '@oneul-sai/contracts';
import type { Request, Response } from 'express';
import { requestIdOf, requestPathname } from './api-error.js';

/** 앱이 넘기는 로거의 최소 모양 — `@oneul-sai/logger`의 `Logger`가 맞는다. */
export interface ErrorLogger {
  error(message: string, fields?: Record<string, unknown>): void;
}

/**
 * 본문 파서(body-parser · http-errors)가 던진 클라이언트 에러의 상태 코드. 413 너무 큰 본문, 415 지원하지 않는 charset,
 * 400 잘못된 압축 등. HttpException이 아니어서 따로 알아본다(`expose`는 http-errors가 4xx에만 켠다).
 */
function clientErrorStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { statusCode, expose } = exception as Record<string, unknown>;
  return expose === true &&
    typeof statusCode === 'number' &&
    statusCode >= 400 &&
    statusCode < 500
    ? statusCode
    : undefined;
}

/** 로그용 스택: `at ...` 프레임만. 첫 줄 이후에도 이어지는 에러 메시지(Prisma는 쿼리 인자 값을 싣는다)는 버린다. */
function stackFrames(exception: unknown): string | undefined {
  if (!(exception instanceof Error) || exception.stack === undefined) {
    return undefined;
  }
  return exception.stack
    .split('\n')
    .filter((line) => /^\s+at /.test(line))
    .join('\n');
}

/**
 * Gateway의 필터를 복사해 `code`를 얹은 것 (SPEC-001 10절 내부 구조). 서비스가 전역 필터로 등록한다.
 * `message`에 입력값을 되돌려 주지 않고, `path`는 query string을 뗀 pathname이다 (12절).
 * - `code`가 있는 HttpException(`apiError`)만 서비스가 쓴 문구를 그대로 싣는다.
 * - `code`가 없는 HttpException(Nest 내부 — 없는 경로, 깨진 JSON)과 본문 파서의 4xx는 상태 이름만 싣는다.
 *   Nest · 파서의 원문에는 요청 경로 · 본문 조각이 섞인다.
 * - 그 밖의 에러는 고정 문구의 500이고, 이것만 로그에 남긴다.
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
      const record =
        typeof body === 'object' && body !== null
          ? (body as Record<string, unknown>)
          : {};
      code = typeof record.code === 'string' ? record.code : undefined;
      if (code !== undefined) {
        error =
          typeof record.error === 'string' ? record.error : exception.name;
        message =
          typeof record.message === 'string'
            ? record.message
            : exception.message;
      } else {
        error = message = STATUS_CODES[statusCode] ?? 'Error';
      }
    } else {
      const clientStatus = clientErrorStatus(exception);
      if (clientStatus !== undefined) {
        statusCode = clientStatus;
        error = message = STATUS_CODES[clientStatus] ?? 'Error';
      } else {
        // @Catch()가 모든 예외를 받으므로 Nest 기본 로거가 돌지 않는다 — 여기서 남기지 않으면 흔적이 없다.
        this.logger?.error('unhandled_error', {
          requestId: requestIdOf(request),
          path: requestPathname(request),
          errorName:
            exception instanceof Error ? exception.name : typeof exception,
          stack: stackFrames(exception),
        });
      }
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
