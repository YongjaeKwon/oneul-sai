import { vi } from 'vitest';
import { fakeLogger } from '../testing/fakes.js';
import { computeBackoffDelaySeconds } from './auth.constants.js';
import { LoginBackoffService } from './login-backoff.service.js';

const NOW = new Date('2026-09-22T10:00:00.000Z');
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000);

interface Counters {
  failedLoginCount: number;
  lastFailedLoginAt: Date | null;
}

/** 실패 카운터 UPDATE 한 문장을 흉내 낸다 (15분 창 판정 + 증가). */
function build(initial: Record<string, Counters>) {
  const state = new Map(Object.entries(initial));
  const events: string[] = [];
  const sleeps: number[] = [];
  const logger = fakeLogger();
  const prisma = {
    member: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const counters = state.get(where.id);
        return counters ? { ...counters } : null;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Counters }) => {
          state.set(where.id, { ...data });
          events.push(`reset:${where.id}`);
          return data;
        },
      ),
    },
    $queryRaw: vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const id = String(values[0]);
        const counters = state.get(id) ?? {
          failedLoginCount: 0,
          lastFailedLoginAt: null,
        };
        const withinWindow =
          counters.lastFailedLoginAt !== null &&
          NOW.getTime() - counters.lastFailedLoginAt.getTime() < 15 * 60_000;
        const next = {
          failedLoginCount: withinWindow ? counters.failedLoginCount + 1 : 1,
          lastFailedLoginAt: NOW,
        };
        state.set(id, next);
        events.push(`fail:${id}`);
        expect(strings.join('?')).toContain('RETURNING "failedLoginCount"');
        return [{ failedLoginCount: next.failedLoginCount }];
      },
    ),
  };
  const service = new LoginBackoffService(prisma as never, {
    logger,
    now: () => NOW,
    sleep: async (ms) => {
      sleeps.push(ms);
      events.push(`sleep:${ms}`);
    },
  });
  return { service, prisma, state, events, sleeps, logger };
}

describe('computeBackoffDelaySeconds', () => {
  it('follows k < 5 ? 0 : min(2^(k-5), 30) with k = failures in window + 1', () => {
    const cases: Array<[number, number]> = [
      [0, 0],
      [3, 0],
      [4, 1],
      [5, 2],
      [6, 4],
      [7, 8],
      [8, 16],
      [9, 30],
      [20, 30],
    ];
    for (const [failures, seconds] of cases) {
      expect(
        computeBackoffDelaySeconds(
          { failedLoginCount: failures, lastFailedLoginAt: minutesAgo(1) },
          NOW,
        ),
      ).toBe(seconds);
    }
  });

  it('treats failures older than 15 minutes as zero', () => {
    expect(
      computeBackoffDelaySeconds(
        { failedLoginCount: 9, lastFailedLoginAt: minutesAgo(16) },
        NOW,
      ),
    ).toBe(0);
    expect(
      computeBackoffDelaySeconds(
        { failedLoginCount: 9, lastFailedLoginAt: null },
        NOW,
      ),
    ).toBe(0);
  });
});

describe('LoginBackoffService.run', () => {
  it('sleeps before verify() from the 5th attempt, and also when the password is right', async () => {
    const { service, events, sleeps, logger } = build({
      m1: { failedLoginCount: 4, lastFailedLoginAt: minutesAgo(1) },
    });
    const verify = vi.fn(async () => {
      events.push('verify');
      return true;
    });

    const result = await service.run('m1', 'login', verify);

    expect(result).toEqual({ ok: true, failedLoginCount: 0 });
    expect(sleeps).toEqual([1000]);
    expect(events).toEqual(['sleep:1000', 'verify', 'reset:m1']);
    expect(logger.warn).toHaveBeenCalledWith('auth.login.backoff', {
      memberId: 'm1',
      failedLoginCount: 4,
      delaySeconds: 1,
      source: 'login',
    });
  });

  it('does not sleep for the first four attempts and records the failure with one UPDATE statement', async () => {
    const { service, prisma, sleeps, state } = build({
      m1: { failedLoginCount: 3, lastFailedLoginAt: minutesAgo(1) },
    });

    const result = await service.run('m1', 'withdraw', async () => false);

    expect(sleeps).toEqual([]);
    expect(result).toEqual({ ok: false, failedLoginCount: 4 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.member.update).not.toHaveBeenCalled();
    expect(state.get('m1')?.failedLoginCount).toBe(4);
  });

  it('honors delayUnitMs and the 30 second cap', async () => {
    const { service, sleeps } = build({
      m1: { failedLoginCount: 12, lastFailedLoginAt: minutesAgo(1) },
    });
    service.delayUnitMs = 10;
    await service.run('m1', 'password', async () => true);
    expect(sleeps).toEqual([300]);
  });

  it('ignores failures outside the 15 minute window: no delay, next failure counts as 1', async () => {
    const { service, sleeps, state } = build({
      m1: { failedLoginCount: 9, lastFailedLoginAt: minutesAgo(16) },
    });
    const result = await service.run('m1', 'phone', async () => false);
    expect(sleeps).toEqual([]);
    expect(result.failedLoginCount).toBe(1);
    expect(state.get('m1')).toEqual({
      failedLoginCount: 1,
      lastFailedLoginAt: NOW,
    });
  });

  it('serializes attempts on the same account so delays add up, and runs other accounts in parallel', async () => {
    const { service, events, sleeps } = build({
      m1: { failedLoginCount: 4, lastFailedLoginAt: minutesAgo(1) },
      m2: { failedLoginCount: 0, lastFailedLoginAt: null },
    });
    let inFlight = 0;
    let overlapped = false;
    const failing = async () => {
      inFlight += 1;
      if (inFlight > 1) overlapped = true;
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      events.push('verify:m1');
      return false;
    };

    const results = await Promise.all([
      service.run('m1', 'login', failing),
      service.run('m1', 'login', failing),
      service.run('m1', 'login', failing),
    ]);

    expect(overlapped).toBe(false);
    expect(results.map((result) => result.failedLoginCount)).toEqual([5, 6, 7]);
    expect(sleeps).toEqual([1000, 2000, 4000]);
    expect(
      events.filter(
        (event) => event.startsWith('sleep') || event.startsWith('verify'),
      ),
    ).toEqual([
      'sleep:1000',
      'verify:m1',
      'sleep:2000',
      'verify:m1',
      'sleep:4000',
      'verify:m1',
    ]);
    expect(service.pendingChains).toBe(0);

    // 다른 계정은 서로 기다리지 않는다
    let m2Started = false;
    const slowM1 = service.run('m1', 'login', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(m2Started).toBe(true);
      return true;
    });
    const quickM2 = service.run('m2', 'login', async () => {
      m2Started = true;
      return true;
    });
    await Promise.all([slowM1, quickM2]);
  });

  it('keeps the chain alive when verify() throws and drops the map entry afterwards', async () => {
    const { service } = build({
      m1: { failedLoginCount: 0, lastFailedLoginAt: null },
    });
    await expect(
      service.run('m1', 'login', async () => {
        throw new Error('scrypt failed');
      }),
    ).rejects.toThrow('scrypt failed');
    await expect(service.run('m1', 'login', async () => true)).resolves.toEqual(
      {
        ok: true,
        failedLoginCount: 0,
      },
    );
    expect(service.pendingChains).toBe(0);
  });

  it('runUnknown runs the dummy verification once with no counter and no delay', async () => {
    const { service, prisma, sleeps } = build({});
    const dummy = vi.fn(async () => false as const);
    const result = await service.runUnknown('nobody@example.com', dummy);
    expect(result).toEqual({ ok: false, failedLoginCount: 0 });
    expect(dummy).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
    expect(prisma.member.findUnique).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
