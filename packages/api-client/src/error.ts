import type { ApiErrorResponse } from '@oneul-sai/contracts';

/** 응답 본문이 `ApiErrorResponse` 모양인지. Gateway · 서비스 모두 이 형태로 에러를 준다. */
export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.statusCode === 'number' &&
    typeof candidate.error === 'string' &&
    typeof candidate.message === 'string'
  );
}

export class ApiClientError extends Error {
  /** `ApiErrorResponse.code`(SPEC-001 에러 코드 표). 본문이 그 형태가 아니면 undefined. */
  readonly code: string | undefined;

  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(
      message ??
        (isApiErrorResponse(body)
          ? body.message
          : `API request failed with status ${status}`),
    );
    this.name = 'ApiClientError';
    this.code = isApiErrorResponse(body) ? body.code : undefined;
  }
}
