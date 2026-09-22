import { SERVICE_NAMES } from '@oneul-sai/constants';
import { API_ERROR_CODES } from '@oneul-sai/contracts';
import { createLogger, type Logger } from '@oneul-sai/logger';
import { apiError } from '../common/api-error.js';
import { SCRYPT_MAX_CONCURRENCY, SCRYPT_MAX_QUEUE } from './auth.constants.js';
import {
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
} from './password.js';

const defaultLogger = createLogger({ service: SERVICE_NAMES.memberService });

export interface PasswordServiceOptions {
  maxConcurrency?: number;
  maxQueue?: number;
  logger?: Logger;
  /** 테스트에서 scrypt를 가짜로 바꿀 때만 쓴다. */
  functions?: {
    hash: typeof hashPassword;
    verify: typeof verifyPassword;
    verifyDummy: typeof verifyDummyPassword;
  };
}

/**
 * scrypt 함수(password.ts) 위에 동시 실행 상한 4 · 대기 큐 32를 얹는다 (SPEC-001 12절 폭주 방어 (b)).
 * scrypt는 libuv 스레드풀(기본 4)에서 돌므로 상한 없이는 인증 없는 로그인 요청만으로 스레드풀이 포화된다.
 * 큐가 차면 503 SERVICE_BUSY(`Retry-After: 1`) — 스레드풀 밖의 큐라 메모리 상한도 잡힌다.
 */
export class PasswordService {
  private readonly maxConcurrency: number;
  private readonly maxQueue: number;
  private readonly logger: Logger;
  private readonly fn: NonNullable<PasswordServiceOptions['functions']>;
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(options: PasswordServiceOptions = {}) {
    this.maxConcurrency = options.maxConcurrency ?? SCRYPT_MAX_CONCURRENCY;
    this.maxQueue = options.maxQueue ?? SCRYPT_MAX_QUEUE;
    this.logger = options.logger ?? defaultLogger;
    this.fn = options.functions ?? {
      hash: hashPassword,
      verify: verifyPassword,
      verifyDummy: verifyDummyPassword,
    };
  }

  get queueLength(): number {
    return this.waiting.length;
  }

  get runningCount(): number {
    return this.running;
  }

  hash(password: string): Promise<string> {
    return this.withSlot(() => this.fn.hash(password));
  }

  verify(password: string, stored: string): Promise<boolean> {
    return this.withSlot(() => this.fn.verify(password, stored));
  }

  /** 없는 이메일용 — scrypt를 정확히 한 번 돌리고 항상 false (이메일 열거 방지). */
  verifyDummy(password: string): Promise<false> {
    return this.withSlot(() => this.fn.verifyDummy(password));
  }

  private async withSlot<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrency) {
      if (this.waiting.length >= this.maxQueue) {
        this.logger.warn('auth.password.busy', {
          queueLength: this.waiting.length,
        });
        throw apiError(
          503,
          API_ERROR_CODES.SERVICE_BUSY,
          '요청이 많아 잠시 후 다시 시도해 주세요.',
        );
      }
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
      });
      // 슬롯은 앞선 작업이 finally에서 넘겨 준다(running은 그대로).
    } else {
      this.running += 1;
    }

    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next !== undefined) {
        next();
      } else {
        this.running -= 1;
      }
    }
  }
}
