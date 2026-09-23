'use client';

import { SCHEDULE_BATCH_MAX } from '@oneul-sai/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { formatDate } from '@/lib/format';
import { BackLink } from './back-link';
import { MeetupForm } from './meetup-form';
import { MeetupScope } from './meetup-scope';
import { Notice } from './notice';
import { PageHeader } from './page-header';
import { ScheduleList } from './schedule-list';
import { Section } from './section';

/** 여러 회차 등록(A9) 뒤 돌아왔을 때 `?registered=N`. */
function registeredCount(value: string | null): number | null {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= SCHEDULE_BATCH_MAX
    ? count
    : null;
}

/** A6 상품 상세 — 위쪽 상품 수정 폼, 아래쪽 회차 목록(SPEC-002 4절). */
export function MeetupDetailScreen({ meetupId }: { meetupId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // 한 번만 알린다 — 주소에서 지워 새로 고침 · 뒤로 가기에 다시 나오지 않게
  const [registered] = useState(() =>
    registeredCount(searchParams.get('registered')),
  );
  useEffect(() => {
    if (searchParams.has('registered')) {
      router.replace(pathname, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  return (
    <MeetupScope meetupId={meetupId}>
      {(meetup) => (
        <div className="flex flex-col gap-6">
          <BackLink href="/meetups">모임 상품</BackLink>
          <PageHeader title={meetup.title}>
            <p>
              등록일{' '}
              <span className="font-display tabular-nums">
                {formatDate(meetup.createdAt)}
              </span>
            </p>
          </PageHeader>

          {registered !== null ? (
            <Notice tone="success">
              {registered}개 회차를 비공개로 등록했습니다. 목록에서 골라 공개해
              주세요.
            </Notice>
          ) : null}

          <Section title="상품 정보">
            <MeetupForm meetup={meetup} />
          </Section>

          <Section title="회차">
            <ScheduleList meetupId={meetup.id} />
          </Section>
        </div>
      )}
    </MeetupScope>
  );
}
