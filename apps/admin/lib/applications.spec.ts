import type { AdminApplication, MemberSummary } from '@oneul-sai/contracts';

import {
  adminCancelQuestion,
  applicantWarnings,
  applicationFilterOf,
  capacityBelowMessage,
  capacityConflictCount,
  formatAppliedCounts,
  memberIdsOf,
  mergeApplicants,
  scheduleCancelApplicantsNote,
} from './applications';

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

  it('does not name a withdrawn member or an unknown one', () => {
    expect(adminCancelQuestion(member(M1, null))).toBe(
      `이 신청을 취소할까요?${rest}`,
    );
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
    ['venueName', { venueName: null }],
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
        maleMinBirthYear: 1990,
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
  });
});
