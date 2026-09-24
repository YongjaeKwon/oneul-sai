import { z } from 'zod';

// SPEC-002 7절 "필드 규칙". 요청 스키마(requests.ts)가 조합해 쓴다.
// 상한은 모두 입력 실수 방지이며 제품 정책이 아니다. 에러 message에는 입력값을 되돌려 주지 않는다(12절).
// 저장된 값 · 요청 시각에 따라 달라지는 규칙(시간 순서 · 미래 · 상한, 연령대 순서, 상태 전이)은 서비스가 판정한다(D14).

/** 참가비(원). 남녀 두 필드 공통. 두 값의 관계는 검사하지 않는다(D3). */
export const PRICE_MIN = 0;
export const PRICE_MAX = 1_000_000;

/** 성별 정원(명). 두 값의 관계는 검사하지 않는다 — 다르면 운영자 화면이 경고만 한다(D2). */
export const CAPACITY_MIN = 1;
export const CAPACITY_MAX = 50;
/** 운영자 화면이 미리 채우는 성별 정원. 서버는 쓰지 않는다(D2). */
export const DEFAULT_CAPACITY_PER_GENDER = 7;

export const MEETUP_TITLE_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 2000;
export const VENUE_AREA_MAX_LENGTH = 50;
export const VENUE_NAME_MAX_LENGTH = 100;
export const VENUE_ADDRESS_MAX_LENGTH = 200;
export const VENUE_DIRECTIONS_MAX_LENGTH = 1000;
export const CANCEL_REASON_MAX_LENGTH = 200;

/** 남성 연령대(출생연도 범위)의 형식. event 쪽 상수다 — member의 가입 상수를 가져오지 않는다(D5). */
export const BIRTH_YEAR_RANGE_MIN = 1900;
export const BIRTH_YEAR_RANGE_MAX = 9999;

/** 생성 · 수정에서 값이 바뀌는 시각은 `now + 365일` 이하(서비스, D7). */
export const SCHEDULE_MAX_LEAD_DAYS = 365;
/** `endsAt − startsAt` 상한(분, 서비스, D7). */
export const SCHEDULE_MAX_DURATION_MINUTES = 720;

/** 여러 회차 등록 한 번의 항목 수 상한(D15). */
export const SCHEDULE_BATCH_MAX = 12;

/** 모든 목록 `page`의 상한. OFFSET 오버플로 · 정밀도 손실이 500이 되지 않게(D9). */
export const PAGE_MAX = 1000;
/** 상품 · 운영자 회차 · 공개 회차 목록의 `pageSize` 기본값. */
export const EVENT_LIST_DEFAULT_PAGE_SIZE = 20;
/** 상품 목록 · 운영자 회차 목록의 `pageSize` 상한. */
export const ADMIN_LIST_MAX_PAGE_SIZE = 100;
/** 공개 회차 목록의 `pageSize` 상한. */
export const PUBLIC_SCHEDULE_LIST_MAX_PAGE_SIZE = 50;
/** 내 신청 목록의 `pageSize` 상한(기본은 `EVENT_LIST_DEFAULT_PAGE_SIZE`). SPEC-003 */
export const MY_APPLICATION_LIST_MAX_PAGE_SIZE = 50;
/** 운영자 신청 목록의 `pageSize` 기본값이자 상한 — 한 회차의 신청을 한 번에 본다. SPEC-003 */
export const ADMIN_APPLICATION_LIST_PAGE_SIZE = 100;

/**
 * 텍스트 필드 금지 문자: 제어 문자(Cc — 줄바꿈 `\n` · `\r` · 탭 제외)와 방향 서식 문자(U+202A–U+202E, U+2066–U+2069).
 * PostgreSQL `text`는 NUL을 저장하지 못하고, 방향 서식 문자는 공개되는 제목 · 지역의 표시를 뒤집을 수 있다(7절).
 * `g` 플래그가 없어 `test`를 여러 번 불러도 상태가 남지 않는다.
 */
export const FORBIDDEN_TEXT_CHARS =
  /(?![\t\n\r])[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;

/** 지도 링크 허용 호스트. `hostname`과 정확히 같아야 한다(접미사 일치 없음, D4). */
export const VENUE_MAP_URL_HOSTS: readonly string[] = [
  'map.kakao.com',
  'place.map.kakao.com',
  'kko.to',
  'map.naver.com',
  'naver.me',
];
/** 정규화한 `href`의 길이 상한. */
export const VENUE_MAP_URL_MAX_LENGTH = 1000;

/**
 * 지도 링크 판정(D4, 12절). 요청 스키마의 refine과 화면의 렌더 재검사(admin 미리보기, 이후 확정자 화면)가 같이 쓴다.
 * `https:`, 허용 호스트와 정확히 같은 `hostname`, 계정 정보 · 포트 없음, 정규화한 `href`가 상한 이하.
 */
export function isAllowedVenueMapUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    VENUE_MAP_URL_HOSTS.includes(url.hostname) &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    url.href.length <= VENUE_MAP_URL_MAX_LENGTH
  );
}

const REQUIRED = '입력해 주세요.';
const FORBIDDEN_CHARS = '쓸 수 없는 문자가 들어 있습니다.';

/** trim 후 `min`~`max`자, 금지 문자 없음. */
function safeText(min: number, max: number) {
  return z
    .string({ error: REQUIRED })
    .trim()
    .min(min, { error: REQUIRED })
    .max(max, { error: `${max}자까지 입력할 수 있습니다.` })
    .refine((value) => !FORBIDDEN_TEXT_CHARS.test(value), {
      error: FORBIDDEN_CHARS,
    });
}

export const MeetupTitleSchema = safeText(1, MEETUP_TITLE_MAX_LENGTH);
/** 여러 줄 허용. 비어 있으면 `""`. */
export const MeetupDescriptionSchema = safeText(0, DESCRIPTION_MAX_LENGTH);
/** 참가자에게 공개하는 장소 힌트. 필수. */
export const VenueAreaSchema = safeText(1, VENUE_AREA_MAX_LENGTH);
export const VenueNameSchema = safeText(1, VENUE_NAME_MAX_LENGTH);
export const VenueAddressSchema = safeText(1, VENUE_ADDRESS_MAX_LENGTH);
/** 여러 줄 허용. */
export const VenueDirectionsSchema = safeText(1, VENUE_DIRECTIONS_MAX_LENGTH);
export const CancelReasonSchema = safeText(1, CANCEL_REASON_MAX_LENGTH);

/** 지도 링크(요청). 파싱 결과의 정규화된 `href`로 바뀐다 — 서비스는 이 값을 저장한다. 응답은 이 규칙을 재사용하지 않는다(7절). */
export const VenueMapUrlSchema = z
  .string({ error: REQUIRED })
  .trim()
  .refine(isAllowedVenueMapUrl, {
    error: '카카오맵 · 네이버 지도에서 공유한 링크를 붙여 넣어 주세요.',
  })
  .transform((value) => new URL(value).href);

/** 남녀 참가비 각각(원, 정수). */
export const SchedulePriceSchema = z
  .number({ error: '참가비를 입력해 주세요.' })
  .int({ error: '참가비는 원 단위 정수로 입력해 주세요.' })
  .min(PRICE_MIN, { error: '참가비를 확인해 주세요.' })
  .max(PRICE_MAX, { error: '참가비를 확인해 주세요.' });

/** 남녀 정원 각각(명). */
export const ScheduleCapacitySchema = z
  .number({ error: '정원을 입력해 주세요.' })
  .int({ error: '정원은 정수로 입력해 주세요.' })
  .min(CAPACITY_MIN, {
    error: `정원은 ${CAPACITY_MIN}명 이상 ${CAPACITY_MAX}명 이하로 입력해 주세요.`,
  })
  .max(CAPACITY_MAX, {
    error: `정원은 ${CAPACITY_MIN}명 이상 ${CAPACITY_MAX}명 이하로 입력해 주세요.`,
  });

/** 남성 연령대의 한쪽 끝(출생연도). `min ≤ max`는 서비스가 병합한 값으로 판정한다(400 `BIRTH_YEAR_RANGE_INVALID`). */
export const ScheduleBirthYearSchema = z
  .number({ error: '출생연도를 입력해 주세요.' })
  .int({ error: '출생연도는 네 자리 숫자로 입력해 주세요.' })
  .min(BIRTH_YEAR_RANGE_MIN, { error: '출생연도를 확인해 주세요.' })
  .max(BIRTH_YEAR_RANGE_MAX, { error: '출생연도를 확인해 주세요.' });

/** 요청 시각: ISO 8601 + offset 필수(`...Z` 또는 `...+09:00`). offset 없는 값은 해석하는 쪽 시간대에 따라 어긋나므로 받지 않는다(D7). */
export const ScheduleDateTimeSchema = z.iso.datetime({
  offset: true,
  error: '시각 형식이 아닙니다.',
});

/** 목록 `page`(query string이라 coerce). 1 이상 `PAGE_MAX` 이하, 기본 1. */
export const ListPageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(PAGE_MAX)
  .default(1);

/** 경로의 `:meetupId`. UUID가 아니면 400 `VALIDATION_FAILED`. */
export const MeetupIdSchema = z.uuid({
  error: '모임 상품 ID 형식이 아닙니다.',
});
/** 경로의 `:scheduleId` · 공개 `:id`. UUID가 아니면 400(web은 API를 부르지 않고 404 화면). */
export const ScheduleIdSchema = z.uuid({ error: '일정 ID 형식이 아닙니다.' });
/** 경로의 `:applicationId`. UUID가 아니면 400. SPEC-003 */
export const ApplicationIdSchema = z.uuid({
  error: '신청 ID 형식이 아닙니다.',
});
