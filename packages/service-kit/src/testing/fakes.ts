// 단위 테스트용 최소 가짜 객체. 빌드에서 제외된다(tsconfig.build.json).
import type { ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';

export interface FakeRequestInit {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[]>;
}

export function fakeRequest(init: FakeRequestInit = {}): Request {
  const url = init.url ?? '/';
  return {
    method: init.method ?? 'GET',
    originalUrl: url,
    url,
    headers: { ...init.headers },
  } as unknown as Request;
}

export interface FakeResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  res: Response;
}

export function fakeResponse(): FakeResponse {
  const state: FakeResponse = {
    statusCode: 200,
    body: undefined,
    headers: {},
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
