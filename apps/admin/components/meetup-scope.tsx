'use client';

import { MeetupIdSchema, type Meetup } from '@oneul-sai/contracts';
import type { ReactNode } from 'react';

import { useEndSessionOn401 } from '@/lib/auth-provider';
import { describeEventError } from '@/lib/errors';
import { useMeetup } from '@/lib/queries';
import { BackLink } from './back-link';
import { Notice } from './notice';

/**
 * 경로의 `meetupId`로 상품을 불러온 뒤에만 화면(A6 · A7 · A8 · A9)을 그린다.
 * ID가 UUID가 아니면 API를 부르지 않는다. 404 · 권한 오류는 코드별 문구로.
 */
export function MeetupScope({
  meetupId,
  children,
}: {
  meetupId: string;
  children: (meetup: Meetup) => ReactNode;
}) {
  const validId = MeetupIdSchema.safeParse(meetupId).success;
  const { data: meetup, error } = useMeetup(meetupId, validId);
  useEndSessionOn401(error);

  if (!validId || error) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink href="/meetups">모임 상품</BackLink>
        <Notice tone="danger">
          {validId
            ? describeEventError(error)
            : '모임 상품 ID 형식이 아닙니다.'}
        </Notice>
      </div>
    );
  }

  if (meetup === undefined) {
    return (
      <p className="py-12 text-center text-sm text-ink-soft" role="status">
        불러오고 있습니다…
      </p>
    );
  }

  return <>{children(meetup)}</>;
}
