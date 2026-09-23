import type {
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
