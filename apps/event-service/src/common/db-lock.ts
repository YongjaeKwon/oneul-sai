import { API_ERROR_CODES } from '@oneul-sai/contracts';
import { apiError } from '@oneul-sai/service-kit';
import type { Prisma } from '../generated/prisma/client.js';
import { dbErrorFields } from './db-error.js';

// SPEC-003 D3 · 11절 "잠금 대기 상한". 회차 · 신청 행을 잠그는 트랜잭션은 잠금 문장 바로 앞에서 대기 상한을 건다.
// 오래 잠금을 쥔 쪽이 하나 있어도 요청과 풀 연결이 무한정 잡히지 않게 한다.

/**
 * `SET LOCAL lock_timeout = '2s'`. 그 트랜잭션이 끝나면(커밋 · 롤백) 풀린다 —
 * 풀로 돌아간 연결의 다음 요청에는 남지 않는다.
 * 제한은 잠금을 얻으려 할 때마다 따로 걸린다. 같은 행을 기다리는 `FOR UPDATE`는 튜플 잠금 → 쥔 트랜잭션 순서로
 * 두 번 기다릴 수 있어, 한 문장의 최대 대기는 약 4초다(SPEC-003 17절).
 */
export async function setLockTimeout(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
): Promise<void> {
  await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
}

/** 503으로 바꾼 이유 — 로그 `schedule.busy` · `application.busy`의 `cause`(SPEC-003 14절). */
export type BusyCause = 'lock_timeout' | 'pool';

/** 잠금 대기 상한 초과(SQLSTATE 55P03) → `lock_timeout`, 트랜잭션 연결 대기 · 제한 시간(Prisma P2028) → `pool`. */
export function busyCauseOf(error: unknown): BusyCause | null {
  const { sqlState, prismaCode } = dbErrorFields(error);
  if (sqlState === '55P03') return 'lock_timeout';
  if (prismaCode === 'P2028') return 'pool';
  return null;
}

/**
 * 쓰기 트랜잭션을 감싼다. 잠금 · 연결을 기다리다 끝난 것이면 `onBusy`(warn 로그)를 부르고
 * 503 `SERVICE_BUSY`로 답한다(`Retry-After: 1`은 service-kit 필터가 붙인다). 그 밖의 에러는 그대로 던진다.
 * 503은 HttpException이라 예상 밖 에러 필터가 로그를 남기지 않는다 — 원인은 `onBusy`가 남긴다.
 */
export async function busyAsServiceUnavailable<T>(
  work: Promise<T>,
  onBusy: (cause: BusyCause) => void,
): Promise<T> {
  try {
    return await work;
  } catch (error) {
    const cause = busyCauseOf(error);
    if (cause === null) throw error;
    onBusy(cause);
    throw apiError(
      503,
      API_ERROR_CODES.SERVICE_BUSY,
      '지금 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
}
