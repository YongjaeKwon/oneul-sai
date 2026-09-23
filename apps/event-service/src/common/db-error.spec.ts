import type { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { fakeLogger, loggedText } from '../testing/fakes.js';
import { dbErrorFields, LoggingHttpExceptionFilter } from './db-error.js';

// SPEC-002 13절 단위 "DB 에러 로그": DETAIL의 행 값(비공개 장소 · 취소 사유)이 로그 · 응답에 새지 않는다(12절).

const MARKER = 'SECRET-VENUE-7f3a';

/** Prisma 7 + PrismaPg의 CHECK 위반과 같은 모양(실제 에러에서 확인한 구조). 표식이 message · meta · cause에 있다. */
function checkViolation(): Prisma.PrismaClientKnownRequestError {
  const cause = {
    originalCode: '23514',
    originalMessage:
      'new row for relation "Schedule" violates check constraint "Schedule_price_valid"',
    kind: 'postgres',
    code: '23514',
    detail: `Failing row contains (…, ${MARKER}, …).`,
  };
  const error = new Prisma.PrismaClientKnownRequestError(
    `Invalid \`prisma.schedule.create()\` invocation: ${MARKER}`,
    {
      code: 'P2039',
      clientVersion: '7.10.0',
      meta: {
        modelName: 'Schedule',
        driverAdapterError: {
          name: 'DriverAdapterError',
          message: `violates check constraint ${MARKER}`,
          cause,
        },
      },
    },
  );
  Object.assign(error, { cause: { detail: MARKER } });
  return error;
}

function fakeHost() {
  const sent: { status?: number; body?: unknown } = {};
  // Express처럼 status()가 statusCode도 바꾼다 — 필터가 최종 상태로 로그 여부를 정한다
  const response = {
    statusCode: 200,
    status(code: number) {
      sent.status = code;
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      sent.body = body;
      return response;
    },
    setHeader: vi.fn(),
  };
  const request = {
    method: 'POST',
    originalUrl: '/api/v1/meetups/x/schedules?venue=secret',
    headers: { 'x-request-id': 'req-1' },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

describe('dbErrorFields', () => {
  it('keeps only SQLSTATE · Prisma code · constraint name', () => {
    const fields = dbErrorFields(checkViolation());
    expect(fields).toEqual({
      errorName: 'PrismaClientKnownRequestError',
      prismaCode: 'P2039',
      sqlState: '23514',
      constraint: 'Schedule_price_valid',
    });
    expect(JSON.stringify(fields)).not.toContain(MARKER);
  });

  it('reads the structured constraint of a foreign key violation', () => {
    expect(
      dbErrorFields({
        name: 'PrismaClientKnownRequestError',
        code: 'P2003',
        meta: {
          driverAdapterError: {
            cause: {
              originalCode: '23503',
              constraint: { index: 'Schedule_meetupId_fkey' },
            },
          },
        },
      }),
    ).toEqual({
      errorName: 'PrismaClientKnownRequestError',
      prismaCode: 'P2003',
      sqlState: '23503',
      constraint: 'Schedule_meetupId_fkey',
    });
  });

  it('returns nothing for non-objects', () => {
    expect(dbErrorFields('boom')).toEqual({});
    expect(dbErrorFields(null)).toEqual({});
  });
});

describe('LoggingHttpExceptionFilter', () => {
  it('logs dbErrorFields only and answers the kit fixed 500', () => {
    const logger = fakeLogger();
    const { host, sent } = fakeHost();

    new LoggingHttpExceptionFilter(logger).catch(checkViolation(), host);

    expect(logger.error).toHaveBeenCalledWith('request.failed', {
      errorName: 'PrismaClientKnownRequestError',
      prismaCode: 'P2039',
      sqlState: '23514',
      constraint: 'Schedule_price_valid',
      method: 'POST',
      path: '/api/v1/meetups/x/schedules',
      requestId: 'req-1',
    });
    expect(loggedText(logger)).not.toContain(MARKER);
    expect(sent.status).toBe(500);
    expect(sent.body).toMatchObject({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(JSON.stringify(sent.body)).not.toContain(MARKER);
  });

  it('does not log body-parser client errors — the kit answers their own 4xx', () => {
    const logger = fakeLogger();
    const { host, sent } = fakeHost();
    // http-errors 모양(PayloadTooLargeError): 로그인 없이 공개 경로에 큰 본문을 보내면 난다
    const tooLarge = Object.assign(new Error('request entity too large'), {
      name: 'PayloadTooLargeError',
      statusCode: 413,
      expose: true,
    });

    new LoggingHttpExceptionFilter(logger).catch(tooLarge, host);

    expect(sent.status).toBe(413);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
