import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { requestIdOf } from './api-error.js';

/** Gateway가 붙인 `x-request-id`. 접속기록 · 로그에 이어서 남긴다. 없으면 'unknown'. */
export const RequestId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    requestIdOf(context.switchToHttp().getRequest<Request>()),
);
