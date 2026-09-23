import { NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { API_ERROR_CODES, type ApiErrorResponse } from '@oneul-sai/contracts';
import { apiError } from './api-error.js';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { fakeRequest, fakeResponse } from './testing/fakes.js';

function host(url: string, headers: Record<string, string> = {}) {
  const request = fakeRequest({ url, headers });
  const response = fakeResponse();
  const argumentsHost = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response.res,
    }),
  } as unknown as ArgumentsHost;
  return { argumentsHost, response };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('renders ApiHttpException as ApiErrorResponse with code and a query-less path', () => {
    const { argumentsHost, response } = host(
      '/api/v1/members?query=01012345678',
      {
        'x-request-id': 'req-1',
      },
    );

    filter.catch(
      apiError(
        409,
        API_ERROR_CODES.EMAIL_ALREADY_EXISTS,
        '이미 가입된 이메일입니다.',
      ),
      argumentsHost,
    );

    expect(response.statusCode).toBe(409);
    const body = response.body as ApiErrorResponse;
    expect(body).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
      code: 'EMAIL_ALREADY_EXISTS',
      message: '이미 가입된 이메일입니다.',
      path: '/api/v1/members',
      requestId: 'req-1',
    });
    expect(JSON.stringify(body)).not.toContain('01012345678');
  });

  it('keeps Nest exceptions without a code and turns unknown errors into 500', () => {
    const notFound = host('/api/v1/nowhere');
    filter.catch(new NotFoundException(), notFound.argumentsHost);
    expect(notFound.response.statusCode).toBe(404);
    expect(notFound.response.body).not.toHaveProperty('code');

    const crash = host('/api/v1/members/me');
    filter.catch(new Error('boom'), crash.argumentsHost);
    expect(crash.response.statusCode).toBe(500);
    expect((crash.response.body as ApiErrorResponse).message).toBe(
      'Internal server error',
    );
  });

  it('adds Retry-After: 1 to 503 SERVICE_BUSY', () => {
    const { argumentsHost, response } = host('/api/v1/auth/login');
    filter.catch(
      apiError(503, API_ERROR_CODES.SERVICE_BUSY, '잠시 후'),
      argumentsHost,
    );
    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('1');
  });
});

describe('HttpExceptionFilter logging', () => {
  it('logs unhandled errors with request id and path, never the query', () => {
    const logged: Array<[string, Record<string, unknown> | undefined]> = [];
    const filter = new HttpExceptionFilter({
      error: (message, fields) => logged.push([message, fields]),
    });
    const { argumentsHost } = host('/api/v1/members?query=010', {
      'x-request-id': 'req-9',
    });

    filter.catch(new TypeError('boom'), argumentsHost);

    expect(logged).toHaveLength(1);
    expect(logged[0]?.[0]).toBe('unhandled_error');
    expect(logged[0]?.[1]).toMatchObject({
      requestId: 'req-9',
      path: '/api/v1/members',
      errorName: 'TypeError',
    });
  });

  it('does not log HttpExceptions (expected 4xx)', () => {
    const logged: string[] = [];
    const filter = new HttpExceptionFilter({ error: (m) => logged.push(m) });
    filter.catch(new NotFoundException(), host('/x').argumentsHost);
    expect(logged).toHaveLength(0);
  });

  it('reports protocol-relative targets as the raw path', () => {
    const { argumentsHost, response } = host('//evil.example/x?y=1');
    new HttpExceptionFilter().catch(new NotFoundException(), argumentsHost);
    expect((response.body as ApiErrorResponse).path).toBe('//evil.example/x');
  });
});
