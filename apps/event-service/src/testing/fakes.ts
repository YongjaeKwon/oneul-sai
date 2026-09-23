// 단위 테스트용 최소 가짜 객체. 빌드에서 제외된다(tsconfig.build.json).
import type { Logger } from '@oneul-sai/logger';
import { vi, type Mock } from 'vitest';

type LogFn = Logger['info'];

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

/** 로그 호출 전체를 한 문자열로 — 값이 새지 않았는지 찾을 때 쓴다. */
export function loggedText(logger: FakeLogger): string {
  return JSON.stringify([
    logger.debug.mock.calls,
    logger.info.mock.calls,
    logger.warn.mock.calls,
    logger.error.mock.calls,
  ]);
}
