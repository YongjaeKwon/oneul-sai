import { NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import { fakeRequest, fakeResponse } from '../testing/http-fakes.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

function hostFor(url: string) {
  const req = fakeRequest({ url, headers: { [HEADER_REQUEST_ID]: 'req-1' } });
  const response = fakeResponse();
  const host = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => response.res,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('HttpExceptionFilter', () => {
  it('path에 query string을 남기지 않는다(운영자 검색어 PII)', () => {
    const { host, response } = hostFor('/api/v1/members?query=01012345678');

    new HttpExceptionFilter().catch(new NotFoundException('없음'), host);

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: '없음',
      path: '/api/v1/members',
      requestId: 'req-1',
      timestamp: expect.any(String),
    });
  });

  it('HttpException이 아니면 500으로 감싼다', () => {
    const { host, response } = hostFor('/health');

    new HttpExceptionFilter().catch(new Error('boom'), host);

    expect(response.statusCode).toBe(500);
    expect(response.body).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      path: '/health',
    });
    expect(JSON.stringify(response.body)).not.toContain('boom');
  });
});
