import { ApiClientError } from '@oneul-sai/api-client';
import type { AdminApplication, MemberSummary } from '@oneul-sai/contracts';

import {
  accountNoteOf,
  adminCancelQuestion,
  applicantWarnings,
  applicationFilterOf,
  capacityBelowMessage,
  capacityConflictCount,
  capacityNotice,
  formatAppliedCounts,
  memberIdsOf,
  memberLookupNotice,
  mergeApplicants,
  scheduleCancelApplicantsNote,
} from './applications';
import { describeEventError } from './errors';

// SPEC-003 13절 단위 "admin 표시 도우미" — A6 · A8 · A10.

const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';

function application(
  memberId: string,
  overrides: Partial<AdminApplication> = {},
): AdminApplication {
  return {
    id: `a-${memberId}`,
    scheduleId: '33333333-3333-4333-8333-333333333333',
    memberId,
    gender: 'MALE',
    price: 30_000,
    status: 'PENDING',
    cancelledBy: null,
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
    ...overrides,
  };
}

function member(id: string, name: string | null): MemberSummary {
  return {
    id,
    email: `${id}@example.com`,
    name,
    gender: name === null ? null : 'MALE',
    birthYear: name === null ? null : 1992,
    phone: name === null ? null : '01012345678',
    role: 'MEMBER',
    status: name === null ? 'WITHDRAWN' : 'ACTIVE',
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('formatAppliedCounts', () => {
  it('shows active applications over capacity for each gender', () => {
    expect(
      formatAppliedCounts({
        appliedMale: 3,
        capacityMale: 7,
        appliedFemale: 5,
        capacityFemale: 7,
      }),
    ).toBe('남 3/7 · 여 5/7');
  });
});

describe('applicationFilterOf (A10 ?status=)', () => {
  it.each([
    ['PENDING', false, 'PENDING'],
    ['CANCELLED', false, 'CANCELLED'],
    ['ALL', true, 'ALL'],
    [undefined, false, 'PENDING'],
    ['pending', false, 'PENDING'],
    [['CANCELLED'], false, 'PENDING'],
    [undefined, true, 'CANCELLED'],
    ['nope', true, 'CANCELLED'],
  ])('%j (cancelled schedule %s) → %s', (value, cancelled, expected) => {
    expect(applicationFilterOf(value, cancelled)).toBe(expected);
  });
});

describe('mergeApplicants (D11)', () => {
  it('attaches members by id, keeps the application order, and leaves unknown members null', () => {
    const apps = [application(M2), application(M1), application(M2)];
    const rows = mergeApplicants(apps, [member(M1, '김하나')]);
    expect(rows.map((row) => row.application)).toEqual(apps);
    expect(rows.map((row) => row.member?.name ?? null)).toEqual([
      null,
      '김하나',
      null,
    ]);
  });

  it('shows applications only when the member lookup failed', () => {
    expect(
      mergeApplicants([application(M1)], undefined).map((row) => row.member),
    ).toEqual([null]);
  });

  it('asks for each member once', () => {
    expect(
      memberIdsOf([application(M1), application(M2), application(M1)]),
    ).toEqual([M1, M2]);
  });
});

describe('adminCancelQuestion (A10)', () => {
  const rest =
    ' 취소하면 이 회원은 이 일정에 다시 신청할 수 없습니다. 신청자에게는 따로 안내해 주세요.';

  it('names the member when known', () => {
    expect(adminCancelQuestion(member(M1, '김하나'))).toBe(
      `김하나님의 신청을 취소할까요?${rest}`,
    );
  });

  it('asks only "이 신청을 취소할까요?" for a withdrawn member (4절 — no reapply, no contact)', () => {
    expect(adminCancelQuestion(member(M1, null))).toBe('이 신청을 취소할까요?');
  });

  it('keeps the afterword when only the name is unknown (lookup failed)', () => {
    expect(adminCancelQuestion(null)).toBe(`이 신청을 취소할까요?${rest}`);
  });
});

describe('applicantWarnings (H)', () => {
  const withApplicants = { appliedMale: 2, appliedFemale: 1 };
  const notify =
    '신청자 3명이 있습니다. 바뀐 내용은 신청자에게 따로 안내해 주세요. 참가비를 바꿔도 이미 한 신청의 금액은 그대로입니다.';
  const deadline =
    '신청 마감 시각을 바꾸면 신청자가 직접 취소할 수 있는 기간도 함께 바뀝니다.';

  it.each([
    ['startsAt', { startsAt: '2026-10-04T14:00:00+09:00' }],
    ['endsAt', { endsAt: '2026-10-04T16:30:00+09:00' }],
    ['venueArea', { venueArea: '성수' }],
    ['venueName', { venueName: null }],
    ['venueAddress', { venueAddress: '서울' }],
    ['venueDirections', { venueDirections: null }],
    ['venueMapUrl', { venueMapUrl: null }],
    ['priceMale', { priceMale: 35_000 }],
    ['priceFemale', { priceFemale: 25_000 }],
  ])('asks once when %s changes', (_field, changes) => {
    expect(applicantWarnings(withApplicants, changes)).toEqual([notify]);
  });

  it('adds the self-cancel window sentence when the apply deadline changes', () => {
    expect(
      applicantWarnings(withApplicants, {
        applyDeadlineAt: '2026-10-03T23:00:00+09:00',
      }),
    ).toEqual([notify, deadline]);
  });

  it('does not ask without active applications or for other fields', () => {
    expect(
      applicantWarnings(
        { appliedMale: 0, appliedFemale: 0 },
        { startsAt: '2026-10-04T14:00:00+09:00' },
      ),
    ).toEqual([]);
    expect(
      applicantWarnings(withApplicants, {
        capacityMale: 8,
        capacityFemale: 8,
        maleMinBirthYear: 1990,
        maleMaxBirthYear: 1995,
      }),
    ).toEqual([]);
  });
});

describe('scheduleCancelApplicantsNote (I)', () => {
  it('counts the active applications that will be cancelled too', () => {
    expect(
      scheduleCancelApplicantsNote({ appliedMale: 2, appliedFemale: 3 }),
    ).toBe(
      '신청 5건도 함께 취소됩니다. 취소한 뒤 신청 목록에서 연락처를 확인할 수 있습니다. 신청자에게는 따로 안내해 주세요.',
    );
    expect(
      scheduleCancelApplicantsNote({ appliedMale: 0, appliedFemale: 0 }),
    ).toBeNull();
  });
});

describe('capacity below applications (D8)', () => {
  it('uses the spec sentence with the count', () => {
    expect(capacityBelowMessage(3)).toBe(
      '정원을 지금 신청 수(3명)보다 작게 줄일 수 없습니다. 신청을 먼저 취소해 주세요.',
    );
  });

  it('picks the count of the gender the sent capacity falls below, men first', () => {
    const fresh = { appliedMale: 4, appliedFemale: 6 };
    expect(capacityConflictCount({ capacityFemale: 5 }, fresh)).toBe(6);
    expect(
      capacityConflictCount({ capacityMale: 3, capacityFemale: 5 }, fresh),
    ).toBe(4);
    expect(capacityConflictCount({ capacityMale: 4 }, fresh)).toBeNull();
    expect(capacityConflictCount({}, fresh)).toBeNull();
    // 남성은 보냈지만 모자라지 않고 여성만 모자라면 여성
    expect(
      capacityConflictCount({ capacityMale: 5, capacityFemale: 5 }, fresh),
    ).toBe(6);
    // 같으면 모자라지 않다
    expect(capacityConflictCount({ capacityFemale: 6 }, fresh)).toBeNull();
  });
});

describe('capacityNotice (A8 — does not block)', () => {
  it('tells only when the value was changed from the saved capacity and is below the applications', () => {
    expect(capacityNotice(2, 3, 7)).toBe(capacityBelowMessage(3));
    expect(capacityNotice(3, 3, 7)).toBeUndefined();
    // 손대지 않은 칸(저장된 정원)은 서버가 판정한다
    expect(capacityNotice(2, 3, 2)).toBeUndefined();
    expect(capacityNotice(null, 3, 7)).toBeUndefined();
    expect(capacityNotice(Number.NaN, 3, 7)).toBeUndefined();
  });
});

describe('accountNoteOf (A10 계정 상태)', () => {
  it('shows only suspended and withdrawn accounts', () => {
    expect(accountNoteOf(member(M1, null))).toBe('탈퇴한 회원');
    expect(
      accountNoteOf({ ...member(M1, '김하나'), status: 'SUSPENDED' }),
    ).toBe('정지');
    expect(accountNoteOf(member(M1, '김하나'))).toBe('');
    expect(accountNoteOf(null)).toBe('');
  });
});

const apiError = (status: number, code: string) =>
  new ApiClientError(status, {
    statusCode: status,
    error: 'x',
    code,
    message: 'server text',
  });

describe('memberLookupNotice (A10 회원 정보 조회 실패)', () => {
  it('uses the 4절 copy for 5xx and network, code copy for other 4xx, nothing for 401', () => {
    const failed =
      '회원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    expect(memberLookupNotice(null)).toBeNull();
    expect(memberLookupNotice(apiError(503, 'SERVICE_UNAVAILABLE'))).toBe(
      failed,
    );
    expect(memberLookupNotice(new TypeError('fetch failed'))).toBe(failed);
    expect(memberLookupNotice(apiError(403, 'ACCOUNT_SUSPENDED'))).toBe(
      '이용이 정지된 계정입니다. 오늘사이에 문의해 주세요.',
    );
    expect(memberLookupNotice(apiError(401, 'UNAUTHENTICATED'))).toBeNull();
  });
});

describe('describeEventError (운영자 화면 오류 문구)', () => {
  it('keeps the admin busy copy for 503 SERVICE_BUSY and one copy for other 5xx', () => {
    expect(describeEventError(apiError(503, 'SERVICE_BUSY'))).toBe(
      '지금 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(describeEventError(apiError(500, 'INTERNAL_ERROR'))).toBe(
      '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  });
});
