import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * 운영자 응답(`/api/v1/meetups/**`)에 `Cache-Control: no-store` (SPEC-002 7절 · 12절).
 * 핸들러 전에 붙이므로 핸들러 · 파이프의 에러 응답에도 남는다. 가드(내부 토큰 · 역할 · content-type)의 401 · 403 · 400은
 * 인터셉터보다 먼저 끝나 붙지 않는다 — 그 본문에는 회차 데이터가 없다. 두 운영자 컨트롤러에만 클래스 수준으로 단다.
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Cache-Control', 'no-store');
    return next.handle();
  }
}
