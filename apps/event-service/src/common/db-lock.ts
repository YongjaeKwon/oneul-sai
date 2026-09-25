import { API_ERROR_CODES } from '@oneul-sai/contracts';
import { apiError } from '@oneul-sai/service-kit';
import type { Prisma } from '../generated/prisma/client.js';
import { dbErrorFields } from './db-error.js';

// SPEC-003 D3 · 11절 "잠금 대기 상한". 회차 · 신청 행을 잠그는 트랜잭션은 잠금 문장 바로 앞에서 대기 상한을 건다.
// 오래 잠금을 쥔 쪽이 하나 있어도 요청과 풀 연결이 무한정 잡히지 않게 한다.

/**
 * `SET LOCAL lock_timeout = '2s'`. 그 트랜잭션이 끝나면(커밋 · 롤백) 풀린다 —
 * 풀로 돌아간 연결의 다음 요청에는 남지 않는다.
 */
export async function setLockTimeout(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
): Promise<void> {
  await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
}

/** 잠금 대기 상한 초과(SQLSTATE 55P03) · 트랜잭션 연결 대기 · 제한 시간(Prisma P2028). */
export function isServiceBusyError(error: unknown): boolean {
  const { sqlState, prismaCode } = dbErrorFields(error);
  return sqlState === '55P03' || prismaCode === 'P2028';
}

/**
 * 쓰기 트랜잭션을 감싼다. 잠금 · 연결을 기다리다 끝난 것이면 503 `SERVICE_BUSY`로 답한다
 * (`Retry-After: 1`은 service-kit 필터가 붙인다). 그 밖의 에러는 그대로 던진다.
 */
export async function busyAsServiceUnavailable<T>(
  work: Promise<T>,
): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (isServiceBusyError(error)) {
      throw apiError(
        503,
        API_ERROR_CODES.SERVICE_BUSY,
        '지금 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
    throw error;
  }
}
