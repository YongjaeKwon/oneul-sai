'use client';

import { Button } from '@oneul-sai/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useEndSessionOn401 } from '@/lib/auth-provider';
import { describeEventError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useMeetupList } from '@/lib/queries';
import { Notice } from './notice';
import { PageHeader } from './page-header';
import { Pagination } from './pagination';

/** A4 모임 상품 목록 — 제목, 등록일(SPEC-002 4절). 정렬은 등록일 최신순(서버). */
export function MeetupListScreen() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, error, isFetching } = useMeetupList({ page });
  useEndSessionOn401(error);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="모임 상품"
        actions={
          <Button onClick={() => router.push('/meetups/new')}>상품 등록</Button>
        }
      >
        <p>
          상품은 제목과 설명만 갖습니다. 참가비 · 정원 · 연령대 · 장소는 상품
          안의 회차마다 정합니다.
        </p>
      </PageHeader>

      {error ? (
        <Notice tone="danger">{describeEventError(error)}</Notice>
      ) : data === undefined ? (
        <p className="py-12 text-center text-sm text-ink-muted" role="status">
          불러오고 있습니다…
        </p>
      ) : (
        <>
          <div
            aria-busy={isFetching}
            className={[
              'relative overflow-x-auto rounded-card border border-line bg-surface transition-opacity',
              isFetching ? 'opacity-60' : '',
            ].join(' ')}
          >
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    제목
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 font-medium whitespace-nowrap"
                  >
                    등록일
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">상세</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-12 text-center text-ink-soft"
                    >
                      아직 등록한 상품이 없습니다. 상품을 먼저 등록해 주세요.
                    </td>
                  </tr>
                ) : (
                  data.items.map((meetup) => (
                    <tr key={meetup.id} className="hover:bg-ivory">
                      <td className="px-4 py-3 font-medium text-ink">
                        {meetup.title}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-soft tabular-nums">
                        {formatDate(meetup.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/meetups/${meetup.id}`}
                          className="whitespace-nowrap text-ink underline decoration-line-strong underline-offset-4 hover:decoration-rose"
                          aria-label={`${meetup.title} 상세`}
                        >
                          상세
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            disabled={isFetching}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
