import { setTimeout as sleepFor } from 'node:timers/promises';
import { SERVICE_NAMES } from '@oneul-sai/constants';
import { createLogger, type Logger } from '@oneul-sai/logger';
import type { PrismaClient } from '../generated/prisma/client.js';
import { computeBackoffDelaySeconds } from './auth.constants.js';

const defaultLogger = createLogger({ service: SERVICE_NAMES.memberService });

/** 어느 경로의 비밀번호 확인인가 (로그 `auth.login.backoff` · `auth.login.failed`의 source). */
export type BackoffSource = 'login' | 'withdraw' | 'password' | 'phone';

export interface BackoffResult {
  ok: boolean;
  /** 갱신 뒤의 값. 성공이면 0. */
  failedLoginCount: number;
}

export interface LoginBackoffOptions {
  logger?: Logger;
  /** 지연 1초에 해당하는 ms. 기본 1000. 통합 테스트가 줄여 쓴다. */
  delayUnitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

type BackoffPrisma = Pick<PrismaClient, 'member' | '$queryRaw'>;

/**
 * SPEC-001 12절 "로그인 실패 백오프" (D6, 2차 리뷰 형태).
 * `run(memberId, source, verify)`: 같은 계정의 "카운터 읽기 → 지연 → scrypt 검증 → 카운터 갱신"을 인메모리 Promise 체인
 * (`Map<memberId, Promise>`)으로 직렬화한다. 지연은 검증 **앞에**, 성공 · 실패 · 정지 여부와 무관하게 붙으므로 응답 시간이
 * 정오를 드러내지 않고, 병렬 추측은 앞선 요청의 지연 뒤에 줄을 선다. 지연은 setTimeout 대기라 DB 커넥션 · 트랜잭션을
 * 잡지 않는다(11절). 카운터는 체인 안에서 다시 읽는다 — 앞선 실패가 반영된 값으로 지연을 계산해야 병렬 3건이 1+2+4초가 된다.
 * 실패 카운터 갱신은 UPDATE 한 문장(15분 창 판정 + 증가, RETURNING)이라 다중 인스턴스에서도 덮어쓰지 않는다.
 * 없는 이메일은 `runUnknown`으로 같은 체인 형태 + 더미 검증을 거친다(카운터 없음, 지연 0).
 * 단일 인스턴스 범위 — 분산은 결정 예정 (Step 8).
 */
export class LoginBackoffService {
  private readonly chains = new Map<string, Promise<unknown>>();
  private readonly logger: Logger;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  /** 통합 테스트에서만 바꾼다 (SPEC-001 13절: 작은 지연 단위로 백오프를 검증). */
  delayUnitMs: number;

  constructor(
    private readonly prisma: BackoffPrisma,
    options: LoginBackoffOptions = {},
  ) {
    this.logger = options.logger ?? defaultLogger;
    this.delayUnitMs = options.delayUnitMs ?? 1000;
    this.sleep =
      options.sleep ??
      (async (ms) => {
        await sleepFor(ms);
      });
    this.now = options.now ?? (() => new Date());
  }

  /** 체인이 남아 있는 계정 수 (테스트 · 관측용). */
  get pendingChains(): number {
    return this.chains.size;
  }

  run(
    memberId: string,
    source: BackoffSource,
    verify: () => Promise<boolean>,
  ): Promise<BackoffResult> {
    return this.serialize(`member:${memberId}`, async () => {
      const counters = await this.prisma.member.findUnique({
        where: { id: memberId },
        select: { failedLoginCount: true, lastFailedLoginAt: true },
      });
      const current = counters ?? {
        failedLoginCount: 0,
        lastFailedLoginAt: null,
      };

      const delaySeconds = computeBackoffDelaySeconds(current, this.now());
      if (delaySeconds > 0) {
        this.logger.warn('auth.login.backoff', {
          memberId,
          failedLoginCount: current.failedLoginCount,
          delaySeconds,
          source,
        });
        await this.sleep(delaySeconds * this.delayUnitMs);
      }

      const ok = await verify();
      if (ok) {
        await this.prisma.member.update({
          where: { id: memberId },
          data: { failedLoginCount: 0, lastFailedLoginAt: null },
        });
        return { ok: true, failedLoginCount: 0 };
      }

      const rows = await this.prisma.$queryRaw<
        Array<{ failedLoginCount: number }>
      >`
        UPDATE "Member"
        SET "failedLoginCount" = CASE
              WHEN "lastFailedLoginAt" IS NULL OR "lastFailedLoginAt" < now() - interval '15 minutes' THEN 1
              ELSE "failedLoginCount" + 1
            END,
            "lastFailedLoginAt" = now()
        WHERE "id" = ${memberId}
        RETURNING "failedLoginCount"`;
      return {
        ok: false,
        failedLoginCount:
          rows[0]?.failedLoginCount ?? current.failedLoginCount + 1,
      };
    });
  }

  /** 없는 이메일: 같은 직렬화 형태로 더미 검증만 한다. 카운터가 없으므로 지연은 0이다. */
  runUnknown(
    email: string,
    verifyDummy: () => Promise<false>,
  ): Promise<BackoffResult> {
    return this.serialize(`unknown:${email}`, async () => {
      await verifyDummy();
      return { ok: false, failedLoginCount: 0 };
    });
  }

  private serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    const tail: Promise<unknown> = run.then(
      () => undefined,
      () => undefined,
    );
    const tracked = tail.finally(() => {
      if (this.chains.get(key) === tracked) {
        this.chains.delete(key);
      }
    });
    this.chains.set(key, tracked);
    return run;
  }
}
