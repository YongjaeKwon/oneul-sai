'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { useEndSessionOn401 } from '@/lib/auth-provider';
import { describeError } from '@/lib/errors';
import {
  parseMemberListFilters,
  toListParams,
  toSearchString,
  type MemberListFilters,
} from '@/lib/member-list-filters';
import { useMemberList } from '@/lib/queries';
import { MemberFilterForm } from './member-filter-form';
import { MemberTable } from './member-table';
import { Notice } from './notice';
import { Pagination } from './pagination';

const LIST_PATH = '/members';

/** A2 회원 목록. 검색 조건의 원천은 URL이라 새로 고침 · 뒤로 가기에도 그대로 남는다. */
export function MemberListScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();
  const filters = parseMemberListFilters(searchParams);

  const { data, error, isFetching } = useMemberList(toListParams(filters));
  useEndSessionOn401(error);

  const navigate = (next: MemberListFilters) => {
    const query = toSearchString(next);
    router.push(query.length > 0 ? `${LIST_PATH}?${query}` : LIST_PATH);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">회원</h1>
        <p className="mt-1 text-sm text-ink-soft">
          이메일 · 이름은 부분 일치, 휴대폰 번호는 앞자리 일치로 찾습니다. 같은
          번호로 가입한 회원은 함께 보입니다.
        </p>
      </div>

      <MemberFilterForm
        key={searchString}
        initial={filters}
        onSearch={navigate}
        onReset={() => router.push(LIST_PATH)}
      />

      {error ? (
        <Notice tone="danger">{describeError(error)}</Notice>
      ) : data === undefined ? (
        <p className="py-12 text-center text-sm text-ink-soft" role="status">
          불러오고 있습니다…
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-soft" role="status">
            전체{' '}
            <span className="font-medium text-ink tabular-nums">
              {data.total.toLocaleString('ko-KR')}
            </span>
            명
          </p>
          <MemberTable items={data.items} busy={isFetching} />
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            disabled={isFetching}
            onChange={(page) => navigate({ ...filters, page })}
          />
        </>
      )}
    </div>
  );
}
