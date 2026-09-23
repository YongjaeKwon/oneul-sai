import { ApiClientError } from '@oneul-sai/api-client';

import { BIRTH_YEAR_RANGE_MESSAGE } from './errors';
import {
  BatchCommonSchema,
  batchCommonDefaults,
  batchFormKey,
  buildRows,
  checkRows,
  deadlineHoursBefore,
  extractItemIndexes,
  publishInOrder,
  weeklyDates,
  type PublishResult,
} from './schedule-batch';

const NOW = Date.parse('2026-09-23T03:00:00.000Z');

function apiError(status: number, code: string): ApiClientError {
  return new ApiClientError(status, {
    statusCode: status,
    error: 'Error',
    message: '고정 문구',
    code,
    path: '/api/v1/meetups/x/schedules/y/status',
    timestamp: '2026-09-23T03:00:00.000Z',
  });
}

const common = {
  ...batchCommonDefaults(),
  endTime: '16:30',
  priceMale: 30000,
  venueArea: '강남역 인근',
};

describe('weeklyDates (매주 반복)', () => {
  it('makes 12 dates 7 days apart from the first date', () => {
    const dates = weeklyDates('2026-09-27', 12);
    expect(dates).toHaveLength(12);
    expect(dates?.[0]).toBe('2026-09-27');
    expect(dates?.[1]).toBe('2026-10-04');
    expect(dates?.[11]).toBe('2026-12-13');
  });

  it('rejects 13 weeks and anything outside 1~12', () => {
    expect(weeklyDates('2026-09-27', 13)).toBeNull();
    expect(weeklyDates('2026-09-27', 0)).toBeNull();
    expect(weeklyDates('2026-09-27', 1.5)).toBeNull();
    expect(weeklyDates('2026-09-27', null)).toBeNull();
  });
});

describe('deadlineHoursBefore ("행사 N시간 전")', () => {
  it('computes the Seoul deadline per date under TZ=UTC', () => {
    expect(deadlineHoursBefore('2026-10-04T14:00', 0)).toBe('2026-10-04T14:00');
    expect(deadlineHoursBefore('2026-10-04T14:00', 24)).toBe(
      '2026-10-03T14:00',
    );
    expect(deadlineHoursBefore('2026-10-04T14:00', 15)).toBe(
      '2026-10-03T23:00',
    );
  });
});

describe('BatchCommonSchema', () => {
  it('accepts the defaults once end time, price and area are filled', () => {
    expect(BatchCommonSchema.safeParse(common).success).toBe(true);
  });

  it('puts errors on the common fields', () => {
    const result = BatchCommonSchema.safeParse({
      ...common,
      endTime: '13:00',
      hoursBefore: -1,
      priceMale: null,
      venueMapUrl: 'http://map.kakao.com/x',
    });
    const paths = result.error?.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining([
        'endTime',
        'hoursBefore',
        'priceMale',
        'venueMapUrl',
      ]),
    );
  });

  // 서버 400이 행에서 고칠 수 없는 칸에 붙지 않게 공통 값에서 먼저 막는다(리뷰)
  it('checks the male birth-year order on the common values', () => {
    const result = BatchCommonSchema.safeParse({
      ...common,
      maleMinBirthYear: 1995,
      maleMaxBirthYear: 1990,
    });
    const issue = result.error?.issues.find(
      (item) => item.path.join('.') === 'maleMinBirthYear',
    );
    expect(issue?.message).toBe(BIRTH_YEAR_RANGE_MESSAGE);
  });

  // 상한이 없으면 아주 큰 값에서 날짜 계산이 깨져 미리보기가 조용히 실패했다(리뷰)
  it('caps "N hours before" at 365 days, like the server', () => {
    const accepts = (hoursBefore: number) =>
      BatchCommonSchema.safeParse({ ...common, hoursBefore }).success;
    expect(accepts(365 * 24)).toBe(true);
    expect(accepts(365 * 24 + 1)).toBe(false);
    expect(accepts(10_000_000_000)).toBe(false);
  });
});

describe('buildRows · checkRows', () => {
  it('builds one row per date and fills both prices from the one price', () => {
    const rows = buildRows(['2026-09-27', '2026-10-04'], {
      ...common,
      hoursBefore: 24,
    });
    expect(rows[1]).toMatchObject({
      key: '2026-10-04',
      startsAt: '2026-10-04T14:00',
      endsAt: '2026-10-04T16:30',
      applyDeadlineAt: '2026-10-03T14:00',
      priceMale: 30000,
      priceFemale: 30000,
    });
  });

  it('returns +09:00 items when every row passes', () => {
    const rows = buildRows(['2026-09-27', '2026-10-04'], common);
    const check = checkRows(rows, common, NOW);
    expect(check.items?.map((item) => item.startsAt)).toEqual([
      '2026-09-27T14:00:00+09:00',
      '2026-10-04T14:00:00+09:00',
    ]);
    expect(check.byKey['2026-09-27']).toEqual({
      errors: [],
      notSunday: false,
      capacityDiffers: false,
    });
  });

  it('flags a later row with the same time and area, and blocks submit', () => {
    const [first, second] = buildRows(['2026-09-27', '2026-10-04'], common);
    if (first === undefined || second === undefined) {
      throw new Error('rows expected');
    }
    const rows = [
      first,
      {
        ...second,
        startsAt: first.startsAt,
        endsAt: first.endsAt,
        applyDeadlineAt: first.applyDeadlineAt,
      },
    ];
    const check = checkRows(rows, common, NOW);
    expect(check.items).toBeNull();
    expect(check.byKey['2026-10-04']?.errors).toEqual([
      '같은 일시 · 지역의 회차가 이미 표에 있습니다.',
    ]);
    expect(check.byKey['2026-09-27']?.errors).toEqual([]);
  });

  it('marks a non-Sunday row and a row with different capacities (warnings only)', () => {
    const [row] = buildRows(['2026-09-26'], { ...common, capacityFemale: 6 });
    if (row === undefined) {
      throw new Error('row expected');
    }
    const check = checkRows([row], common, NOW);
    expect(check.byKey['2026-09-26']).toMatchObject({
      notSunday: true,
      capacityDiffers: true,
      errors: [],
    });
    expect(check.items).toHaveLength(1);
  });

  it('does not add "남녀 정원 다름" when a capacity is not a number (the error is enough)', () => {
    const [row] = buildRows(['2026-09-27'], common);
    if (row === undefined) {
      throw new Error('row expected');
    }
    const check = checkRows(
      [{ ...row, capacityMale: Number.NaN, capacityFemale: Number.NaN }],
      common,
      NOW,
    );
    expect(check.byKey['2026-09-27']?.capacityDiffers).toBe(false);
    expect(check.byKey['2026-09-27']?.errors.length).toBeGreaterThan(0);
    expect(check.items).toBeNull();
  });
});

describe('batchFormKey (미리보기가 낡았는지)', () => {
  it('ignores the hidden female price left by toggling same price off and on', () => {
    expect(batchFormKey({ ...common, priceFemale: 30000 })).toBe(
      batchFormKey({ ...common, priceFemale: null }),
    );
  });

  it('changes when a sent value changes, including to a non-number', () => {
    expect(batchFormKey({ ...common, maleMinBirthYear: 1990 })).not.toBe(
      batchFormKey(common),
    );
    // JSON.stringify는 NaN과 null을 같게 쓴다 — 따로 표시해야 잘못 친 값도 낡음으로 잡힌다
    expect(batchFormKey({ ...common, maleMinBirthYear: Number.NaN })).not.toBe(
      batchFormKey(common),
    );
  });
});

describe('extractItemIndexes', () => {
  it('finds every item index in a 400 message', () => {
    expect(
      extractItemIndexes('items.2.startsAt: 형식, items.5.priceMale: 범위'),
    ).toEqual([2, 5]);
    expect(extractItemIndexes('items.3: 시간 규칙')).toEqual([3]);
    expect(
      extractItemIndexes('items.1.startsAt: 규칙, items.1.venueArea: 길이'),
    ).toEqual([1]);
  });

  it('returns nothing when the message has no item index', () => {
    expect(extractItemIndexes('to: 규칙')).toEqual([]);
  });
});

describe('publishInOrder (여러 회차 공개)', () => {
  it('calls one at a time in the chosen order and keeps going after a 400', async () => {
    const calls: string[] = [];
    let inFlight = 0;
    const results: Record<string, PublishResult> = {};

    const outcome = await publishInOrder(
      ['a', 'b', 'c', 'd'],
      async (id) => {
        inFlight += 1;
        expect(inFlight).toBe(1);
        calls.push(id);
        await Promise.resolve();
        inFlight -= 1;
        if (id === 'c') {
          throw apiError(400, 'SCHEDULE_TIME_INVALID');
        }
      },
      (id, result) => {
        results[id] = result;
      },
    );

    expect(calls).toEqual(['a', 'b', 'c', 'd']);
    expect(outcome.stoppedBy).toBeNull();
    expect(results).toEqual({
      a: { ok: true },
      b: { ok: true },
      c: { ok: false, message: '신청 마감이 지나 공개하지 못했습니다.' },
      d: { ok: true },
    });
  });

  it('stops without calling the rest on 401', async () => {
    const calls: string[] = [];
    const outcome = await publishInOrder(
      ['a', 'b', 'c'],
      async (id) => {
        calls.push(id);
        if (id === 'b') {
          throw apiError(401, 'UNAUTHENTICATED');
        }
      },
      () => undefined,
    );
    expect(calls).toEqual(['a', 'b']);
    expect(outcome.stoppedBy).toBeInstanceOf(ApiClientError);
  });

  it('uses the row messages for 404 · 409 and network errors', async () => {
    const results: Record<string, PublishResult> = {};
    await publishInOrder(
      ['gone', 'moved', 'offline'],
      async (id) => {
        if (id === 'gone') throw apiError(404, 'SCHEDULE_NOT_FOUND');
        if (id === 'moved') throw apiError(409, 'INVALID_STATUS_TRANSITION');
        throw new TypeError('Failed to fetch');
      },
      (id, result) => {
        results[id] = result;
      },
    );
    expect(results).toEqual({
      gone: {
        ok: false,
        message: '상태가 바뀌어 공개하지 못했습니다. 화면을 새로 고쳐 주세요.',
      },
      moved: {
        ok: false,
        message: '상태가 바뀌어 공개하지 못했습니다. 화면을 새로 고쳐 주세요.',
      },
      offline: {
        ok: false,
        message: '공개하지 못했습니다. 이 회차만 다시 골라 눌러 주세요.',
      },
    });
  });
});
