import type {
  ChangePasswordRequest,
  MemberProfile,
  UpdateMyProfileRequest,
} from '@oneul-sai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from './api';
import { useAuth } from './auth';
import { meKey } from './query-keys';

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
