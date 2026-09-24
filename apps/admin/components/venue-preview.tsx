import { isAllowedVenueMapUrl, type AdminSchedule } from '@oneul-sai/contracts';
import type { ReactNode } from 'react';

import { DetailList } from './detail-list';

const NOT_YET = (
  <span className="text-ink-soft">아직 입력하지 않았습니다.</span>
);

function orNotYet(value: string | null, render: (value: string) => ReactNode) {
  return value === null ? NOT_YET : render(value);
}

/**
 * A8 "확정자에게 보일 장소 안내" 미리보기. 저장된 값을 텍스트로만 그린다(평문 — 12절).
 * 지도 링크는 렌더 직전에 허용 목록으로 다시 검사하고, 통과하지 못하면 링크 없이 글자로만 보여 준다(D4).
 */
export function VenuePreview({
  schedule,
}: {
  schedule: Pick<
    AdminSchedule,
    'venueName' | 'venueAddress' | 'venueDirections' | 'venueMapUrl'
  >;
}) {
  return (
    <div className="flex flex-col gap-3">
      <DetailList
        items={[
          {
            label: '장소 이름',
            value: orNotYet(schedule.venueName, (value) => value),
          },
          {
            label: '주소',
            value: orNotYet(schedule.venueAddress, (value) => value),
          },
          {
            label: '찾아오는 길',
            value: orNotYet(schedule.venueDirections, (value) => (
              <span className="whitespace-pre-line">{value}</span>
            )),
          },
          {
            label: '지도',
            value: orNotYet(schedule.venueMapUrl, (value) =>
              isAllowedVenueMapUrl(value) ? (
                <a
                  href={value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-rose"
                >
                  지도 열기
                </a>
              ) : (
                <span className="break-all text-ink-soft">{value}</span>
              ),
            ),
          },
        ]}
      />
      <p className="text-xs text-ink-soft">
        참가자 일정 화면에는 지역만 보입니다. 참가 확정자에게 이 내용을 보여
        주는 화면과 알림은 아직 없습니다.
      </p>
    </div>
  );
}
