'use client';

import {
  ACCOUNT_STATUSES,
  AccountStatusSchema,
  MEMBER_LIST_QUERY_MAX_LENGTH,
  MEMBER_ROLES,
  MemberRoleSchema,
} from '@oneul-sai/contracts';
import { Button, Input, Label } from '@oneul-sai/ui';
import { useId, useState } from 'react';

import { selectClasses } from '@/lib/form-styles';
import { ROLE_LABELS, STATUS_LABELS } from '@/lib/format';
import type { MemberListFilters } from '@/lib/member-list-filters';

export interface MemberFilterFormProps {
  /** URL에서 읽은 현재 조건. 바뀌면 부모가 `key`로 이 폼을 다시 만든다. */
  initial: MemberListFilters;
  onSearch: (filters: MemberListFilters) => void;
  onReset: () => void;
}

/** A2 검색 조건 — 검색어(이메일 · 이름 부분 일치, 휴대폰 앞자리 일치), 상태 · 역할 필터. */
export function MemberFilterForm({
  initial,
  onSearch,
  onReset,
}: MemberFilterFormProps) {
  const queryId = useId();
  const statusId = useId();
  const roleId = useId();
  const [query, setQuery] = useState(initial.query);
  const [status, setStatus] = useState(initial.status);
  const [role, setRole] = useState(initial.role);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch({ query: query.trim(), status, role, page: 1 });
      }}
      className="grid gap-4 rounded-card border border-line bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] sm:items-end"
    >
      <div>
        <Label htmlFor={queryId}>검색어</Label>
        <Input
          id={queryId}
          type="search"
          value={query}
          maxLength={MEMBER_LIST_QUERY_MAX_LENGTH}
          placeholder="이메일 · 이름 · 휴대폰 앞자리"
          autoComplete="off"
          className="mt-1.5"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor={statusId}>상태</Label>
        <select
          id={statusId}
          value={status}
          className={`${selectClasses} mt-1.5`}
          onChange={(event) => {
            const parsed = AccountStatusSchema.safeParse(event.target.value);
            setStatus(parsed.success ? parsed.data : '');
          }}
        >
          <option value="">전체</option>
          {ACCOUNT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={roleId}>역할</Label>
        <select
          id={roleId}
          value={role}
          className={`${selectClasses} mt-1.5`}
          onChange={(event) => {
            const parsed = MemberRoleSchema.safeParse(event.target.value);
            setRole(parsed.success ? parsed.data : '');
          }}
        >
          <option value="">전체</option>
          {MEMBER_ROLES.map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit">검색</Button>
        <Button
          variant="ghost"
          onClick={() => {
            // URL이 이미 비어 있으면 부모가 이 폼을 다시 만들지 않으므로 입력값도 여기서 비운다.
            setQuery('');
            setStatus('');
            setRole('');
            onReset();
          }}
        >
          초기화
        </Button>
      </div>
    </form>
  );
}
