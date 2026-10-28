'use client';

import {
  REFUND_POLICY,
  ScheduleIdSchema,
  type AdminSchedule,
  type Meetup,
} from '@oneul-sai/contracts';
import Link from 'next/link';

import { formatAppliedCounts } from '@/lib/applications';
import { useEndSessionOn401 } from '@/lib/auth-provider';
import { describeEventError } from '@/lib/errors';
import {
  EMPTY,
  formatBirthYears,
  formatCapacity,
  formatPrice,
  formatScheduleRange,
  formatScheduleTime,
} from '@/lib/format';
import { useSchedule } from '@/lib/queries';
import { BackLink } from './back-link';
import { DetailList } from './detail-list';
import { MeetupScope } from './meetup-scope';
import { Notice } from './notice';
import { PageHeader } from './page-header';
import { ScheduleForm } from './schedule-form';
import { ScheduleStatusActions } from './schedule-status-actions';
import { ScheduleStatusBadge } from './schedule-status-badge';
import { Section } from './section';
import { VenuePreview } from './venue-preview';

/** A7 회차 만들기(`/meetups/[meetupId]/schedules/new`). */
export function ScheduleCreateScreen({ meetupId }: { meetupId: string }) {
  return (
    <MeetupScope meetupId={meetupId}>
      {(meetup) => (
        <div className="flex flex-col gap-6">
          <BackLink href={`/meetups/${meetup.id}`}>{meetup.title}</BackLink>
          <PageHeader title="회차 만들기">
            <p>
              {meetup.title} · 비공개로 만들어집니다. 만든 뒤 상세에서 공개해
              주세요.
            </p>
          </PageHeader>
          <Section title="회차 정보">
            <ScheduleForm meetupId={meetup.id} />
          </Section>
        </div>
      )}
    </MeetupScope>
  );
}

/** A8 회차 상세(`/meetups/[meetupId]/schedules/[scheduleId]`). */
export function ScheduleDetailScreen({
  meetupId,
  scheduleId,
}: {
  meetupId: string;
  scheduleId: string;
}) {
  return (
    <MeetupScope meetupId={meetupId}>
      {(meetup) => <ScheduleDetail meetup={meetup} scheduleId={scheduleId} />}
    </MeetupScope>
  );
}

function ScheduleDetail({
  meetup,
  scheduleId,
}: {
  meetup: Meetup;
  scheduleId: string;
}) {
  const validId = ScheduleIdSchema.safeParse(scheduleId).success;
  const {
    data: schedule,
    error,
    dataUpdatedAt,
  } = useSchedule(meetup.id, scheduleId, validId);
  useEndSessionOn401(error);

  const back = (
    <BackLink href={`/meetups/${meetup.id}`}>{meetup.title}</BackLink>
  );

  // 다시 부르기만 실패했으면(가진 회차가 있으면) 화면을 두어 고치던 입력을 잃지 않게 한다
  if (!validId || (error && schedule === undefined)) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <Notice tone="danger">
          {validId ? describeEventError(error) : '회차 ID 형식이 아닙니다.'}
        </Notice>
      </div>
    );
  }

  if (schedule === undefined) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <p className="py-12 text-center text-sm text-ink-soft" role="status">
          불러오고 있습니다…
        </p>
      </div>
    );
  }

  const cancelled = schedule.status === 'CANCELLED';

  return (
    <div className="flex flex-col gap-6">
      {back}

      <PageHeader
        title={formatScheduleRange(schedule.startsAt, schedule.endsAt)}
      >
        <div>
          <ScheduleStatusBadge schedule={schedule} now={dataUpdatedAt} />
        </div>
        <p>
          {meetup.title} · {schedule.venueArea}
        </p>
      </PageHeader>

      {cancelled ? (
        <>
          <Notice>취소한 회차입니다. 고치거나 상태를 바꿀 수 없습니다.</Notice>
          <ApplicationSummary schedule={schedule} />
          <Section title="회차 정보">
            <DetailList
              items={[
                {
                  label: '일시',
                  value: formatScheduleRange(
                    schedule.startsAt,
                    schedule.endsAt,
                  ),
                },
                {
                  label: '신청 마감',
                  value: formatScheduleTime(schedule.applyDeadlineAt),
                },
                {
                  label: '참가비',
                  value: formatPrice(
                    schedule.priceMale,
                    schedule.priceFemale,
                    schedule.priceNote,
                  ),
                },
                {
                  label: '정원',
                  value: formatCapacity(
                    schedule.capacityMale,
                    schedule.capacityFemale,
                    schedule.minPerGender,
                  ),
                },
                {
                  label: '연령대',
                  value: formatBirthYears(schedule) || '제한 없음',
                },
                {
                  label: '참가 조건',
                  value: schedule.participantCondition ?? EMPTY,
                },
                { label: '지역', value: schedule.venueArea },
                {
                  label: '취소 사유',
                  value: (
                    <span className="whitespace-pre-line">
                      {schedule.cancelReason ?? EMPTY}
                    </span>
                  ),
                },
              ]}
            />
          </Section>
        </>
      ) : (
        <>
          <Section title="상태">
            <ScheduleStatusActions schedule={schedule} now={dataUpdatedAt} />
          </Section>
          <ApplicationSummary schedule={schedule} />
          <Section title="회차 정보">
            <ScheduleForm meetupId={meetup.id} schedule={schedule} />
          </Section>
        </>
      )}

      <Section title="확정자에게 보일 장소 안내">
        <VenuePreview schedule={schedule} />
      </Section>

      {/* D18 · R3 — contracts 상수를 그대로 그린다(회차마다 고칠 수 없다). 제목은 사이트 머리글 그대로 */}
      <Section title="취소 및 환불 규정">
        <ul className="flex flex-col gap-1.5 text-sm text-ink">
          {REFUND_POLICY.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-soft">
          참가자 일정 화면에 같은 문장이 보입니다.
        </p>
      </Section>
    </div>
  );
}

/**
 * A8 신청 요약 카드(SPEC-003 4절): "신청 남 a/b · 여 c/d · 접수 남 e · 여 f" + 신청 목록(A10). DRAFT는 아직 신청을 받지 않는다.
 * 취소된 회차에도 남아 A10을 "취소" 필터로 연다(기본 필터는 "전체"라 주소에 명시한다) — 신청자 연락처 확인용(I).
 */
function ApplicationSummary({ schedule }: { schedule: AdminSchedule }) {
  if (schedule.status === 'DRAFT') {
    return (
      <Section title="신청">
        <p className="text-sm text-ink-soft">공개한 뒤에 신청을 받습니다.</p>
      </Section>
    );
  }
  const listHref = `/meetups/${schedule.meetupId}/schedules/${schedule.id}/applications${
    schedule.status === 'CANCELLED' ? '?status=CANCELLED' : ''
  }`;
  return (
    <Section title="신청">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-base text-ink tabular-nums">
          신청 {formatAppliedCounts(schedule)}
        </p>
        <Link
          href={listHref}
          className="text-sm whitespace-nowrap text-ink underline decoration-line-strong underline-offset-4 hover:decoration-rose"
        >
          신청 목록 보기
        </Link>
      </div>
    </Section>
  );
}
