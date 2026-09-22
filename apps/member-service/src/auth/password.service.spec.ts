import type { ApiHttpException } from '../common/api-error.js';
import { fakeLogger } from '../testing/fakes.js';
import { PasswordService } from './password.service.js';

interface Deferred {
  resolve: (value: boolean) => void;
}

function build(options: { maxConcurrency?: number; maxQueue?: number } = {}) {
  const pending: Deferred[] = [];
  const logger = fakeLogger();
  const service = new PasswordService({
    ...options,
    logger,
    functions: {
      hash: async () => 'scrypt$hash',
      verify: () =>
        new Promise<boolean>((resolve) => {
          pending.push({ resolve });
        }),
      verifyDummy: async () => false,
    },
  });
  return { service, pending, logger };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('PasswordService (scrypt concurrency cap and queue)', () => {
  it('runs at most 4 verifications at once and queues the 5th', async () => {
    const { service, pending } = build();
    const calls = Array.from({ length: 5 }, () =>
      service.verify('pw', 'stored'),
    );
    await flush();

    expect(service.runningCount).toBe(4);
    expect(pending).toHaveLength(4);
    expect(service.queueLength).toBe(1);

    pending[0]!.resolve(true);
    await flush();
    expect(service.runningCount).toBe(4);
    expect(pending).toHaveLength(5);
    expect(service.queueLength).toBe(0);

    for (const deferred of pending.slice(1)) deferred.resolve(false);
    await expect(Promise.all(calls)).resolves.toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(service.runningCount).toBe(0);
  });

  it('rejects with 503 SERVICE_BUSY once the queue (32) is full and logs auth.password.busy', async () => {
    const { service, pending, logger } = build();
    const accepted = Array.from({ length: 36 }, () =>
      service.verify('pw', 'stored').catch((error: unknown) => error),
    );
    await flush();
    expect(service.queueLength).toBe(32);

    let rejected: unknown;
    try {
      await service.verify('pw', 'stored');
    } catch (error) {
      rejected = error;
    }
    const exception = rejected as ApiHttpException;
    expect(exception.getStatus()).toBe(503);
    expect(exception.code).toBe('SERVICE_BUSY');
    expect(logger.warn).toHaveBeenCalledWith('auth.password.busy', {
      queueLength: 32,
    });

    // 큐가 비면 다시 받는다
    for (let i = 0; i < 36; i += 1) {
      await flush();
      pending[i]!.resolve(true);
    }
    const results = await Promise.all(accepted);
    expect(results.every((result) => result === true)).toBe(true);
    expect(service.queueLength).toBe(0);
    expect(service.runningCount).toBe(0);
  });

  it('frees the slot when the underlying function throws', async () => {
    const service = new PasswordService({
      functions: {
        hash: async () => {
          throw new Error('scrypt failed');
        },
        verify: async () => true,
        verifyDummy: async () => false,
      },
    });
    await expect(service.hash('pw')).rejects.toThrow('scrypt failed');
    expect(service.runningCount).toBe(0);
    await expect(service.verifyDummy('pw')).resolves.toBe(false);
  });
});
