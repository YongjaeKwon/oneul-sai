import type {
  AdminApplicationListParams,
  AdminScheduleListParams,
  MeetupListParams,
  MemberListParams,
} from '@oneul-sai/api-client';
import type {
  AdminSchedule,
  BatchCreateSchedulesRequest,
  CreateMeetupRequest,
  CreateScheduleRequest,
  Meetup,
  MemberDetail,
  UpdateMeetupRequest,
  UpdateMemberStatusRequest,
  UpdateScheduleRequest,
  UpdateScheduleStatusRequest,
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

// ----- 모임 상품 · 회차 (SPEC-002 4절 A4~A9) -----

export const meetupKeys = {
  all: ['meetups'] as const,
  lists: () => [...meetupKeys.all, 'list'] as const,
  list: (params: MeetupListParams) => [...meetupKeys.lists(), params] as const,
  detail: (meetupId: string) =>
    [...meetupKeys.all, 'detail', meetupId] as const,
  schedules: (meetupId: string) =>
    [...meetupKeys.all, 'schedules', meetupId] as const,
  scheduleList: (meetupId: string, params: AdminScheduleListParams) =>
    [...meetupKeys.schedules(meetupId), 'list', params] as const,
  schedule: (meetupId: string, scheduleId: string) =>
    [...meetupKeys.schedules(meetupId), 'detail', scheduleId] as const,
  /** 회차 상세 키 아래 — 회차를 무효화하면 신청 목록도 함께 새로 부른다. */
  applications: (
    meetupId: string,
    scheduleId: string,
    params: AdminApplicationListParams,
  ) =>
    [
      ...meetupKeys.schedule(meetupId, scheduleId),
      'applications',
      params,
    ] as const,
};

/** A4 상품 목록 · A9 상품 선택. */
export function useMeetupList(params: MeetupListParams) {
  return useQuery({
    queryKey: meetupKeys.list(params),
    queryFn: () => apiClient.listMeetups(params),
    placeholderData: keepPreviousData,
  });
}

/** A6 · A7 · A8 상품. `enabled`가 false면(ID 형식 오류) 호출하지 않는다. */
export function useMeetup(meetupId: string, enabled = true) {
  return useQuery({
    queryKey: meetupKeys.detail(meetupId),
    queryFn: () => apiClient.getMeetup(meetupId),
    enabled,
  });
}

/** A5 상품 등록. */
export function useCreateMeetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMeetupRequest) => apiClient.createMeetup(input),
    onSuccess: (meetup: Meetup) => {
      queryClient.setQueryData(meetupKeys.detail(meetup.id), meetup);
      void queryClient.invalidateQueries({ queryKey: meetupKeys.lists() });
    },
  });
}

/** A6 상품 수정(바꾼 필드만). */
export function useUpdateMeetup(meetupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateMeetupRequest) =>
      apiClient.updateMeetup(meetupId, input),
    onSuccess: (meetup: Meetup) => {
      queryClient.setQueryData(meetupKeys.detail(meetupId), meetup);
      void queryClient.invalidateQueries({ queryKey: meetupKeys.lists() });
      // 제목은 회차 응답에도 실린다(D1).
      void queryClient.invalidateQueries({
        queryKey: meetupKeys.schedules(meetupId),
      });
    },
  });
}

/** A6 회차 목록(모든 상태). */
export function useScheduleList(
  meetupId: string,
  params: AdminScheduleListParams,
) {
  return useQuery({
    queryKey: meetupKeys.scheduleList(meetupId, params),
    queryFn: () => apiClient.listSchedules(meetupId, params),
    placeholderData: keepPreviousData,
  });
}

/** A8 회차 상세. */
export function useSchedule(
  meetupId: string,
  scheduleId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: meetupKeys.schedule(meetupId, scheduleId),
    queryFn: () => apiClient.getSchedule(meetupId, scheduleId),
    enabled,
  });
}

/** 응답(AdminSchedule)으로 상세 캐시를 갱신하고 목록은 다시 불러오게 한다. */
function useScheduleSaved(meetupId: string) {
  const queryClient = useQueryClient();

  return (schedule: AdminSchedule) => {
    queryClient.setQueryData(
      meetupKeys.schedule(meetupId, schedule.id),
      schedule,
    );
    void queryClient.invalidateQueries({
      queryKey: [...meetupKeys.schedules(meetupId), 'list'],
    });
  };
}

/**
 * 회차를 새로 읽어 캐시에 넣는다(A8 저장 전 안내 · 회차 취소 창의 신청 수 — SPEC-003 H · I). 실패하면 null을 돌려주고
 * 캐시는 건드리지 않는다 — 공유 쿼리를 오류 상태로 만들면 회차 상세가 오류 화면으로 바뀌어 고치던 입력이 사라진다.
 */
export function useRefreshSchedule(meetupId: string) {
  const queryClient = useQueryClient();

  return async (scheduleId: string): Promise<AdminSchedule | null> => {
    try {
      const fresh = await apiClient.getSchedule(meetupId, scheduleId);
      queryClient.setQueryData(
        meetupKeys.schedule(meetupId, scheduleId),
        fresh,
      );
      return fresh;
    } catch {
      return null;
    }
  };
}

/** A7 회차 만들기(항상 DRAFT). */
export function useCreateSchedule(meetupId: string) {
  const onSuccess = useScheduleSaved(meetupId);

  return useMutation({
    mutationFn: (input: CreateScheduleRequest) =>
      apiClient.createSchedule(meetupId, input),
    onSuccess,
  });
}

/** A9 여러 회차 등록. 상품은 화면에서 고르므로 변수로 받는다. 전부 또는 없음(D15). */
export function useCreateSchedulesBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      meetupId,
      input,
    }: {
      meetupId: string;
      input: BatchCreateSchedulesRequest;
    }) => apiClient.createSchedulesBatch(meetupId, input),
    onSuccess: (_result, { meetupId }) => {
      void queryClient.invalidateQueries({
        queryKey: meetupKeys.schedules(meetupId),
      });
    },
  });
}

/** A8 회차 수정(바꾼 필드만). */
export function useUpdateSchedule(meetupId: string, scheduleId: string) {
  const onSuccess = useScheduleSaved(meetupId);

  return useMutation({
    mutationFn: (input: UpdateScheduleRequest) =>
      apiClient.updateSchedule(meetupId, scheduleId, input),
    onSuccess,
  });
}

/** A8 상태 전이(공개 · 모집 마감 · 다시 열기 · 취소). */
export function useUpdateScheduleStatus(meetupId: string, scheduleId: string) {
  const onSuccess = useScheduleSaved(meetupId);

  return useMutation({
    mutationFn: (input: UpdateScheduleStatusRequest) =>
      apiClient.updateScheduleStatus(meetupId, scheduleId, input),
    onSuccess,
  });
}

/** A8 삭제(DRAFT만, 204). 상세 캐시는 화면이 떠나며 버려진다 — 여기서 지우면 떠나기 전에 404를 다시 부른다. */
export function useDeleteSchedule(meetupId: string, scheduleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.deleteSchedule(meetupId, scheduleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...meetupKeys.schedules(meetupId), 'list'],
      });
    },
  });
}

// ----- 참가 신청 (SPEC-003 4절 A10) -----

/** A10 회차의 신청 목록(신청 순, 100개씩). */
export function useScheduleApplications(
  meetupId: string,
  scheduleId: string,
  params: AdminApplicationListParams,
) {
  return useQuery({
    queryKey: meetupKeys.applications(meetupId, scheduleId, params),
    queryFn: () =>
      apiClient.listScheduleApplications(meetupId, scheduleId, params),
    placeholderData: keepPreviousData,
  });
}

/**
 * A10 한 페이지 신청자의 회원 정보(`GET /members?ids=`, D11). 신청이 없으면 부르지 않는다.
 * 목록 화면이 떠나면 캐시는 기본 시간 뒤 버려지고, 로그아웃하면 `queryClient.clear()`로 지워진다.
 * `pageSize`를 ID 개수로 맞춘다 — 서버는 ID가 페이지 크기보다 많으면 400이다.
 */
export function useMembersByIds(ids: readonly string[]) {
  const params: MemberListParams = { ids: [...ids], pageSize: ids.length };
  return useQuery({
    queryKey: memberKeys.list(params),
    queryFn: () => apiClient.listMembers(params),
    enabled: ids.length > 0,
    // 취소 · 페이지 이동으로 ID가 바뀌어도 남은 행의 이름이 비지 않게(합치기는 ID로 한다)
    placeholderData: keepPreviousData,
  });
}

/** A10 운영자 취소. 성공이든 실패든 그 상품의 회차 · 신청을 새로 부른다(신청 수 · 목록이 함께 바뀐다). */
export function useCancelApplication(meetupId: string, scheduleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (applicationId: string) =>
      apiClient.cancelApplication(meetupId, scheduleId, applicationId),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: meetupKeys.schedules(meetupId),
      }),
  });
}
