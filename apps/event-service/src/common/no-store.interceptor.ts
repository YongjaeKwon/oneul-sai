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
 * 핸들러 전에 붙이므로 에러 응답에도 남는다. 두 운영자 컨트롤러에만 클래스 수준으로 단다.
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
