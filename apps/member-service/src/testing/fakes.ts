// 단위 테스트용 최소 가짜 객체. 빌드에서 제외된다(tsconfig.build.json의 exclude는 *.spec.ts뿐이므로 이 파일은 dist에 남지만 import되지 않는다).
import type { ExecutionContext } from '@nestjs/common';
import type { Logger } from '@oneul-sai/logger';
import type { CookieOptions, Request, Response } from 'express';
import { vi, type Mock } from 'vitest';

export interface FakeRequestInit {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[]>;
  cookies?: Record<string, string>;
}

export function fakeRequest(init: FakeRequestInit = {}): Request {
  const url = init.url ?? '/';
  return {
    method: init.method ?? 'GET',
    originalUrl: url,
    url,
    headers: { ...init.headers },
    cookies: { ...init.cookies },
  } as unknown as Request;
}

export interface RecordedCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

export interface FakeResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  cookies: RecordedCookie[];
  res: Response;
}

export function fakeResponse(): FakeResponse {
  const state: FakeResponse = {
    statusCode: 200,
    body: undefined,
    headers: {},
    cookies: [],
    res: undefined as unknown as Response,
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = value;
      return res;
    },
    cookie(name: string, value: string, options: CookieOptions) {
      state.cookies.push({ name, value, options });
      return res;
    },
  };
  state.res = res as unknown as Response;
  return state;
}

/** 가드 테스트용. `handler` · `controller`에 붙은 메타데이터를 Reflector가 읽는다. */
export function fakeExecutionContext(input: {
  request: Request;
  handler?: () => unknown;
  controller?: new (...args: never[]) => unknown;
}): ExecutionContext {
  const handler = input.handler ?? function handler() {};
  const controller = input.controller ?? class Controller {};
  return {
    switchToHttp: () => ({
      getRequest: () => input.request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
    getHandler: () => handler,
    getClass: () => controller,
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => undefined,
    switchToWs: () => undefined,
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

type LogFn = Logger['warn'];

export interface FakeLogger extends Logger {
  debug: Mock<LogFn>;
  info: Mock<LogFn>;
  warn: Mock<LogFn>;
  error: Mock<LogFn>;
}

export function fakeLogger(): FakeLogger {
  return {
    debug: vi.fn<LogFn>(),
    info: vi.fn<LogFn>(),
    warn: vi.fn<LogFn>(),
    error: vi.fn<LogFn>(),
  };
}
