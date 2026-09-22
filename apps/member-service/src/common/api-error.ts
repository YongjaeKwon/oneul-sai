import { HttpException } from '@nestjs/common';
import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import type { ApiErrorCode } from '@oneul-sai/contracts';
import type { Request } from 'express';

// SPEC-001 7절 "에러 코드 표". 서비스가 내는 에러는 항상 기계용 `code`를 갖는다.
// 예외 필터(src/filters)가 이 예외를 `ApiErrorResponse`(+code)로 바꾼다.

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  503: 'Service Unavailable',
};

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  code: ApiErrorCode;
  message: string;
}

export class ApiHttpException extends HttpException {
  readonly code: ApiErrorCode;

  constructor(statusCode: number, code: ApiErrorCode, message: string) {
    const body: ApiErrorBody = {
      statusCode,
      error: STATUS_TEXT[statusCode] ?? 'Error',
      code,
      message,
    };
    super(body, statusCode);
    this.code = code;
  }
}

export function apiError(
  statusCode: number,
  code: ApiErrorCode,
  message: string,
): ApiHttpException {
  return new ApiHttpException(statusCode, code, message);
}

/** query string을 뗀 pathname (SPEC-001 7절 · 12절) — 운영자 검색어(PII)가 응답 · 로그에 남지 않게. */
export function requestPathname(req: Pick<Request, 'originalUrl'>): string {
  return new URL(req.originalUrl, 'http://member-service').pathname;
}

export function requestIdOf(req: Pick<Request, 'headers'>): string {
  const header = req.headers[HEADER_REQUEST_ID];
  return typeof header === 'string' && header.length > 0 ? header : 'unknown';
}
