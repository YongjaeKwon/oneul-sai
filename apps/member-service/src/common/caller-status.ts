import { API_ERROR_CODES } from '@oneul-sai/contracts';
import type { AccountStatus } from '../generated/prisma/enums.js';
import { apiError } from './api-error.js';

/**
 * 모든 "회원" · "ADMIN" 경로는 x-user-id의 회원 상태를 함께 읽어 (SPEC-001 7절 엔드포인트 요약)
 * WITHDRAWN(또는 행 없음)이면 401 UNAUTHENTICATED, SUSPENDED면 403 ACCOUNT_SUSPENDED를 낸다.
 * 거부 목록 없이 정지 · 탈퇴 직후의 남은 access token을 막는 장치다 (11절).
 */
export function assertCallerUsable<T extends { status: AccountStatus }>(
  member: T | null,
): asserts member is T {
  if (member === null || member.status === 'WITHDRAWN') {
    throw apiError(
      401,
      API_ERROR_CODES.UNAUTHENTICATED,
      '로그인이 필요합니다.',
    );
  }
  if (member.status === 'SUSPENDED') {
    throw apiError(
      403,
      API_ERROR_CODES.ACCOUNT_SUSPENDED,
      '이용이 정지된 계정입니다. 오늘사이에 문의해 주세요.',
    );
  }
}
