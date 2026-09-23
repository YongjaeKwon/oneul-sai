import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { SERVICE_NAMES } from '@oneul-sai/constants';
import { createLogger, type Logger } from '@oneul-sai/logger';
import {
  HttpExceptionFilter,
  requestIdOf,
  requestPathname,
} from '@oneul-sai/service-kit';
import type { Request } from 'express';

// SPEC-002 12절 "로그 규칙 — DB 에러". PostgreSQL은 CHECK 위반(23514) 등의 DETAIL에 "Failing row contains (...)"로
// 행 전체(비공개 장소 · 취소 사유 포함)를 싣고, 그 값이 Prisma 에러의 message · meta · cause에도 실린다.
// 그래서 에러를 로그에 남길 때 err 객체를 넘기지 않고 이 함수가 꺼낸 식별자만 남긴다.

export interface DbErrorFields {
  /** 에러 클래스 이름(예: PrismaClientKnownRequestError) */
  errorName?: string;
  /** Prisma 코드(P2003 등) */
  prismaCode?: string;
  /** PostgreSQL SQLSTATE(23514 등) */
  sqlState?: string;
  /** 제약 이름(Schedule_price_valid 등) */
  constraint?: string;
}

const IDENTIFIER = /^\w+$/;
const PRISMA_CODE = /^P\d{4}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;
// 제약 이름만 뽑는다. 나머지 문구는 버린다.
const CONSTRAINT_IN_MESSAGE = /constraint "(\w+)"/;

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function matching(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === 'string' && pattern.test(value) ? value : undefined;
}

/** Prisma · 드라이버 어댑터 에러에서 식별자(SQLSTATE · Prisma 코드 · 제약 이름)만 꺼낸다. 값 · 문구 · DETAIL은 버린다. */
export function dbErrorFields(error: unknown): DbErrorFields {
  // Prisma 7 + PrismaPg: meta.driverAdapterError.cause = { originalCode, originalMessage, constraint?, detail? }
  const cause =
    field(field(field(error, 'meta'), 'driverAdapterError'), 'cause') ??
    field(error, 'cause');
  const constraintIndex = field(field(cause, 'constraint'), 'index');
  const originalMessage = field(cause, 'originalMessage');
  const fromMessage =
    typeof originalMessage === 'string'
      ? CONSTRAINT_IN_MESSAGE.exec(originalMessage)?.[1]
      : undefined;

  const fields: DbErrorFields = {
    errorName: matching(field(error, 'name'), IDENTIFIER),
    prismaCode: matching(field(error, 'code'), PRISMA_CODE),
    sqlState:
      matching(field(cause, 'originalCode'), SQLSTATE) ??
      matching(field(cause, 'code'), SQLSTATE),
    constraint: matching(constraintIndex, IDENTIFIER) ?? fromMessage,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as DbErrorFields;
}

/**
 * service-kit `HttpExceptionFilter`에 예상 밖 에러(HttpException이 아닌 것 — Prisma · 드라이버 에러 포함)의 로그 한 줄을 더한다.
 * 로그에는 `dbErrorFields`만 남기고, 응답은 kit 필터의 고정 문구 500 그대로다.
 */
@Catch()
export class LoggingHttpExceptionFilter implements ExceptionFilter {
  private readonly inner = new HttpExceptionFilter();

  constructor(
    private readonly logger: Logger = createLogger({
      service: SERVICE_NAMES.eventService,
    }),
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (!(exception instanceof HttpException)) {
      const request = host.switchToHttp().getRequest<Request>();
      this.logger.error('request.failed', {
        ...dbErrorFields(exception),
        method: request.method,
        path: requestPathname(request),
        requestId: requestIdOf(request),
      });
    }
    this.inner.catch(exception, host);
  }
}
