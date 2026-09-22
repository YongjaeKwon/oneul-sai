import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import { randomId } from '@oneul-sai/utils';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `API request failed with status ${status}`);
    this.name = 'ApiClientError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null | undefined;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestInit {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  async request<T>(
    method: HttpMethod,
    path: string,
    init: ApiRequestInit = {},
  ): Promise<T> {
    const url = this.buildUrl(path, init.query);
    const headers = new Headers();
    headers.set(HEADER_REQUEST_ID, randomId());

    const token = this.options.getAccessToken?.();
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }

    let body: string | undefined;
    if (init.body !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(init.body);
    }

    const response = await fetch(url, { method, headers, body });

    if (!response.ok) {
      const errorBody = await parseResponseBody(response);
      throw new ApiClientError(response.status, errorBody);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await parseResponseBody(response)) as T;
  }

  get<T>(path: string, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('GET', path, init);
  }

  post<T>(path: string, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('POST', path, init);
  }

  put<T>(path: string, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('PUT', path, init);
  }

  patch<T>(path: string, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('PATCH', path, init);
  }

  delete<T>(path: string, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('DELETE', path, init);
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): string {
    const base = this.options.baseUrl.replace(/\/+$/, '');
    let url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString.length > 0) {
        url += `?${queryString}`;
      }
    }
    return url;
  }
}
