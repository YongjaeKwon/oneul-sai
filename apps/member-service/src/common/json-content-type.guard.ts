import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { API_ERROR_CODES } from '@oneul-sai/contracts';
import type { Request } from 'express';
import { apiError } from './api-error.js';

/**
 * 본문을 받는 경로는 `Content-Type: application/json`만 받는다 (SPEC-001 7절 공통 규칙, 12절 "로그인 CSRF").
 * 다른 사이트의 HTML form은 이 content-type을 preflight 없이 보낼 수 없다. urlencoded 파서는 켜지 않으므로(app.ts)
 * 다른 content-type의 본문은 파싱되지 않은 채 여기서 400으로 끝난다.
 */
export function isJsonContentType(header: string | undefined): boolean {
  if (header === undefined) return false;
  const mediaType = header.split(';')[0]?.trim().toLowerCase();
  return mediaType === 'application/json';
}

@Injectable()
export class JsonContentTypeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!isJsonContentType(request.headers['content-type'])) {
      throw apiError(
        400,
        API_ERROR_CODES.VALIDATION_FAILED,
        'content-type: application/json',
      );
    }
    return true;
  }
}
