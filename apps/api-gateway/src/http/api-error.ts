import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import { API_ERROR_CODES } from '@oneul-sai/contracts';
import type { ApiErrorCode, ApiErrorResponse } from '@oneul-sai/contracts';
import type { Request, Response } from 'express';
import { requestPathname } from './request-path.js';

/** SPEC-001 7절 에러 코드 표의 403 `ORIGIN_NOT_ALLOWED`(Gateway · 서비스 공용). */
export const ORIGIN_NOT_ALLOWED = API_ERROR_CODES.ORIGIN_NOT_ALLOWED;

export type GatewayErrorCode = ApiErrorCode;

/** Gateway가 직접 내는 에러는 항상 기계용 `code`를 갖는다 (SPEC-001 7절 에러 코드 표). */
export type GatewayErrorResponse = ApiErrorResponse & {
  code: GatewayErrorCode;
};

export interface GatewayErrorInput {
  statusCode: number;
  error: string;
  code: GatewayErrorCode;
  message: string;
}

export function requestId(req: Pick<Request, 'headers'>): string {
  const header = req.headers[HEADER_REQUEST_ID];
  return typeof header === 'string' ? header : 'unknown';
}

export function buildApiError(
  req: Pick<Request, 'headers' | 'originalUrl'>,
  input: GatewayErrorInput,
): GatewayErrorResponse {
  return {
    statusCode: input.statusCode,
    error: input.error,
    code: input.code,
    message: input.message,
    path: requestPathname(req),
    requestId: requestId(req),
    timestamp: new Date().toISOString(),
  };
}

export function sendApiError(
  req: Pick<Request, 'headers' | 'originalUrl'> & {
    resume?: () => unknown;
  },
  res: Pick<Response, 'status'>,
  input: GatewayErrorInput,
): void {
  // 본문을 읽기 전에 응답하면 Node가 소켓을 끊어 클라이언트가 ECONNRESET을 본다(429/401/403은 모두 본문 소비 전이다).
  req.resume?.();
  res.status(input.statusCode).json(buildApiError(req, input));
}
