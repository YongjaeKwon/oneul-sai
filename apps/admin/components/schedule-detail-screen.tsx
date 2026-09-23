'use client';

import { ScheduleIdSchema, type Meetup } from '@oneul-sai/contracts';

import { useEndSessionOn401 } from '@/lib/auth-provider';
import { describeEventError } from '@/lib/errors';
import {
  EMPTY,
  formatCapacity,
  formatMaleBirthYears,
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

  if (!validId || error) {
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
        <p className="py-12 text-center text-sm text-ink-muted" role="status">
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
                  value: formatPrice(schedule.priceMale, schedule.priceFemale),
                },
                {
                  label: '정원',
                  value: formatCapacity(
                    schedule.capacityMale,
                    schedule.capacityFemale,
                  ),
                },
                {
                  label: '남성 연령대',
                  value:
                    formatMaleBirthYears(
                      schedule.maleMinBirthYear,
                      schedule.maleMaxBirthYear,
                    ) || '제한 없음',
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
          <Section title="회차 정보">
            <ScheduleForm meetupId={meetup.id} schedule={schedule} />
          </Section>
        </>
      )}

      <Section title="확정자에게 보일 장소 안내">
        <VenuePreview schedule={schedule} />
      </Section>
    </div>
  );
}
