// 단위 테스트용 최소 가짜 객체. 빌드에서 제외된다(tsconfig.build.json).
import type { Logger } from '@oneul-sai/logger';
import type { Request, Response } from 'express';
import { vi, type Mock } from 'vitest';

export interface FakeRequestInit {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[]>;
  ip?: string;
}

export function fakeRequest(init: FakeRequestInit = {}): Request {
  const url = init.url ?? '/';
  const ip = init.ip ?? '127.0.0.1';
  return {
    method: init.method ?? 'GET',
    originalUrl: url,
    url,
    headers: { ...init.headers },
    ip,
    socket: { remoteAddress: ip },
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
