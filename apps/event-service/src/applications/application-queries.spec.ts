import {
  isActive,
  isSeated,
  NO_APPLICATIONS,
  SEATED_APPLICATION_WHERE,
  seatCountsBySchedule,
  seatsOf,
} from './application-queries.js';

// SPEC-003 13절 단위(개정): 집합 둘(활성 · 자리 잡은, D14)과 여섯 값 집계(D17). 쿼리는 가짜 groupBy로 모양만 본다.

const ID = '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01';

describe('application sets (D14)', () => {
  it('SEATED_APPLICATION_WHERE is an allow list: PENDING · CONFIRMED', () => {
    expect(SEATED_APPLICATION_WHERE).toEqual({
      status: { in: ['PENDING', 'CONFIRMED'] },
    });
  });

  it.each([
    ['APPLIED', true, false],
    ['PENDING', true, true],
    ['CONFIRMED', true, true],
    ['CANCELLED', false, false],
  ] as const)('%s: active %s · seated %s', (status, active, seated) => {
    expect(isActive(status)).toBe(active);
    expect(isSeated(status)).toBe(seated);
  });
});

describe('seatCountsBySchedule · seatsOf (D17)', () => {
  const db = (groups: unknown[]) => {
    const groupBy = vi.fn(async () => groups);
    return {
      groupBy,
      prisma: { application: { groupBy } } as unknown as Parameters<
        typeof seatCountsBySchedule
      >[0],
    };
  };

  it('splits one groupBy(scheduleId, gender, status) into seated and received counts', async () => {
    const { prisma, groupBy } = db([
      {
        scheduleId: ID,
        gender: 'MALE',
        status: 'APPLIED',
        _count: { _all: 2 },
      },
      {
        scheduleId: ID,
        gender: 'MALE',
        status: 'PENDING',
        _count: { _all: 3 },
      },
      {
        scheduleId: ID,
        gender: 'FEMALE',
        status: 'CONFIRMED',
        _count: { _all: 1 },
      },
    ]);
    const counts = await seatCountsBySchedule(prisma, [ID]);
    expect(counts.get(ID)).toEqual({
      appliedMale: 3,
      receivedMale: 2,
      appliedFemale: 1,
      receivedFemale: 0,
    });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['scheduleId', 'gender', 'status'],
      where: { scheduleId: { in: [ID] }, status: { not: 'CANCELLED' } },
      _count: { _all: true },
    });
  });

  it('adds PENDING and CONFIRMED of one gender into the same seated count', async () => {
    const { prisma } = db([
      {
        scheduleId: ID,
        gender: 'MALE',
        status: 'PENDING',
        _count: { _all: 4 },
      },
      {
        scheduleId: ID,
        gender: 'MALE',
        status: 'CONFIRMED',
        _count: { _all: 3 },
      },
    ]);
    expect((await seatCountsBySchedule(prisma, [ID])).get(ID)).toMatchObject({
      appliedMale: 7,
      receivedMale: 0,
    });
  });

  it('skips the query for an empty page', async () => {
    const { prisma, groupBy } = db([]);
    expect(await seatCountsBySchedule(prisma, [])).toEqual(new Map());
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('judges full by the seated count only — 10 received · 0 seated of 7 is not full', () => {
    expect(
      seatsOf(
        { capacityMale: 7, capacityFemale: 7 },
        {
          appliedMale: 0,
          receivedMale: 10,
          appliedFemale: 7,
          receivedFemale: 0,
        },
      ),
    ).toEqual({
      appliedMale: 0,
      receivedMale: 10,
      appliedFemale: 7,
      receivedFemale: 0,
      maleFull: false,
      femaleFull: true,
    });
  });

  it('a new schedule is zeros and not full', () => {
    expect(seatsOf({ capacityMale: 7, capacityFemale: 7 })).toEqual({
      ...NO_APPLICATIONS,
      maleFull: false,
      femaleFull: false,
    });
  });
});
