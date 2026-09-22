import type { MemberListParams } from '@oneul-sai/api-client';
import type {
  MemberDetail,
  UpdateMemberStatusRequest,
} from '@oneul-sai/contracts';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiClient } from './api';

// 보호 데이터는 모두 클라이언트 컴포넌트에서 TanStack Query로 조회한다(SPEC-001 4절 · 7절 "클라이언트").

export const memberKeys = {
  all: ['members'] as const,
  lists: () => [...memberKeys.all, 'list'] as const,
  list: (params: MemberListParams) => [...memberKeys.lists(), params] as const,
  details: () => [...memberKeys.all, 'detail'] as const,
  detail: (id: string) => [...memberKeys.details(), id] as const,
};

/** A2 회원 목록. 페이지를 넘길 때 이전 결과를 유지해 표가 비지 않게 한다. */
export function useMemberList(params: MemberListParams) {
  return useQuery({
    queryKey: memberKeys.list(params),
    queryFn: () => apiClient.listMembers(params),
    placeholderData: keepPreviousData,
  });
}

/** A3 회원 상세. `enabled`가 false면(ID 형식 오류) 호출하지 않는다. */
export function useMember(id: string, enabled = true) {
  return useQuery({
    queryKey: memberKeys.detail(id),
    queryFn: () => apiClient.getMember(id),
    enabled,
  });
}

/** A3 계정 상태 변경. 응답(MemberDetail)으로 상세 캐시를 바로 갱신하고 목록은 다시 불러오게 한다. */
export function useUpdateMemberStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateMemberStatusRequest) =>
      apiClient.updateMemberStatus(id, input),
    onSuccess: (detail: MemberDetail) => {
      queryClient.setQueryData(memberKeys.detail(id), detail);
      void queryClient.invalidateQueries({ queryKey: memberKeys.lists() });
    },
  });
}
