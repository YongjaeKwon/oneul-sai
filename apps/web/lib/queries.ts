import type { MyApplicationListParams } from '@oneul-sai/api-client';
import type {
  ChangePasswordRequest,
  MemberProfile,
  UpdateMyProfileRequest,
} from '@oneul-sai/contracts';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiClient } from './api';
import { useAuth } from './auth';
import { meKey, myApplicationsKey } from './query-keys';

// 보호 데이터는 모두 클라이언트 컴포넌트에서 TanStack Query로 조회한다(SPEC-001 4절 · 7절 "클라이언트").

/** W3 내 프로필. 로그인 상태에서만 부르며, 캐시는 로그인 · 부팅 refresh 응답으로 이미 채워져 있다. */
export function useMe() {
  const { state } = useAuth();

  return useQuery({
    queryKey: meKey,
    queryFn: () => apiClient.getMe(),
    enabled: state.status === 'authenticated',
    staleTime: 60_000,
  });
}

/** W4 프로필 수정. 응답(MemberProfile)으로 캐시를 바로 갱신한다. */
export function useUpdateMe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateMyProfileRequest) => apiClient.updateMe(input),
    onSuccess: (profile: MemberProfile) => {
      queryClient.setQueryData(meKey, profile);
    },
  });
}

/** W5 비밀번호 변경. 204 — 현재 탭의 세션은 유지된다. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordRequest) =>
      apiClient.changePassword(input),
  });
}

// ----- 참가 신청 (SPEC-003 4절 W9 · W10) -----

/**
 * 내 신청(모든 상태, 최근 신청부터). `enabled`가 거짓이면 부르지 않는다 — 운영자 계정은 이 경로가 403이다.
 * W10에서 페이지를 옮기는 동안 이전 페이지를 보인다(`keepPreviousData` — 목록이 "불러오는 중"으로 깜빡이지 않게).
 */
export function useMyApplications(
  params: MyApplicationListParams,
  enabled: boolean,
) {
  const { state } = useAuth();

  return useQuery({
    queryKey: [...myApplicationsKey, params],
    queryFn: () => apiClient.listMyApplications(params),
    enabled: enabled && state.status === 'authenticated',
    placeholderData: keepPreviousData,
  });
}

/** 성공이든 거절이든 내 신청을 다시 불러 화면을 서버 상태에 맞춘다(409 `ALREADY_APPLIED` → 접수됨, `REAPPLY_NOT_ALLOWED` → 다시 신청 불가). */
function useInvalidateMyApplications() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: myApplicationsKey });
}

/** W9 참가 신청. 201이면 입금 대기. */
export function useApply() {
  const invalidate = useInvalidateMyApplications();

  return useMutation({
    mutationFn: (scheduleId: string) => apiClient.apply(scheduleId),
    onSettled: invalidate,
  });
}

/** W9 · W10 본인 취소(신청 마감 전까지). */
export function useCancelMyApplication() {
  const invalidate = useInvalidateMyApplications();

  return useMutation({
    mutationFn: (applicationId: string) =>
      apiClient.cancelMyApplication(applicationId),
    onSettled: invalidate,
  });
}
