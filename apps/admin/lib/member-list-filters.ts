import type { MemberListParams } from '@oneul-sai/api-client';
import {
  AccountStatusSchema,
  MEMBER_LIST_QUERY_MAX_LENGTH,
  MemberRoleSchema,
  type AccountStatus,
  type MemberRole,
} from '@oneul-sai/contracts';

/** 회원 목록 화면의 검색 조건. 원천은 URL query string이라 새로 고침 · 뒤로 가기에도 유지된다. */
export interface MemberListFilters {
  query: string;
  status: AccountStatus | '';
  role: MemberRole | '';
  page: number;
}

export function parseMemberListFilters(
  searchParams: URLSearchParams,
): MemberListFilters {
  const status = AccountStatusSchema.safeParse(searchParams.get('status'));
  const role = MemberRoleSchema.safeParse(searchParams.get('role'));
  const page = Number.parseInt(searchParams.get('page') ?? '', 10);

  return {
    query: (searchParams.get('query') ?? '')
      .trim()
      .slice(0, MEMBER_LIST_QUERY_MAX_LENGTH),
    status: status.success ? status.data : '',
    role: role.success ? role.data : '',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

export function toSearchString(filters: MemberListFilters): string {
  const params = new URLSearchParams();
  if (filters.query.length > 0) {
    params.set('query', filters.query);
  }
  if (filters.status !== '') {
    params.set('status', filters.status);
  }
  if (filters.role !== '') {
    params.set('role', filters.role);
  }
  if (filters.page > 1) {
    params.set('page', String(filters.page));
  }
  return params.toString();
}

/** `GET /api/v1/members` 조건. 빈 값은 보내지 않는다(서버 기본값 · strict 스키마). */
export function toListParams(filters: MemberListFilters): MemberListParams {
  return {
    query: filters.query.length > 0 ? filters.query : undefined,
    status: filters.status !== '' ? filters.status : undefined,
    role: filters.role !== '' ? filters.role : undefined,
    page: filters.page,
  };
}
