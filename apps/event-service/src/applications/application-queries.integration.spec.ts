import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { inject } from 'vitest';
import { setLockTimeout } from '../common/db-lock.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { resetTestDatabase } from '../testing/test-database.js';
import {
  cancelActiveForSchedule,
  seatCountsBySchedule,
} from './application-queries.js';

// SPEC-003 17절에 적기로 한 세 가지를 실제 DB로 고정한다(5a PR · 개정 2번 PR).
// (1) 연쇄 취소 `cancelActiveForSchedule`이 조건을 담은 UPDATE **한 문장**이다(D8 — 읽고 나서 쓰는 두 문장이 아니다).
// (2) `SET LOCAL lock_timeout`이 그 트랜잭션에만 걸린다 — 풀로 돌아간 연결의 다음 요청에 남지 않는다(D3).
// (3) `seatCountsBySchedule`의 `groupBy(scheduleId, gender, status)`가 SELECT **한 문장**이다(D17).

const url = inject('testDatabaseUrl');
const queries: string[] = [];
// 연결 하나짜리 풀: 트랜잭션 뒤의 요청이 같은 연결을 쓴다는 것이 보장된다
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, max: 1 }),
  log: [{ emit: 'event', level: 'query' }],
});
prisma.$on('query', (event) => queries.push(event.query));

beforeEach(() => resetTestDatabase(prisma));
afterAll(async () => {
  await resetTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('application queries (integration)', () => {
  it('cancelActiveForSchedule runs one conditional UPDATE', async () => {
    const { id: meetupId } = await prisma.meetup.create({
      data: { title: '오늘사이' },
    });
    const startsAt = new Date('2030-10-06T05:00:00Z');
    const { id: scheduleId } = await prisma.schedule.create({
      data: {
        meetupId,
        startsAt,
        endsAt: new Date('2030-10-06T07:00:00Z'),
        applyDeadlineAt: startsAt,
        priceMale: 0,
        priceFemale: 0,
        capacityMale: 7,
        capacityFemale: 7,
        venueArea: '성수',
      },
    });
    for (const gender of ['MALE', 'FEMALE'] as const) {
      await prisma.application.create({
        data: { scheduleId, memberId: randomUUID(), gender, price: 0 },
      });
    }

    queries.length = 0;
    const count = await prisma.$transaction((tx) =>
      cancelActiveForSchedule(tx, scheduleId),
    );

    expect(count).toBe(2);
    const touching = queries.filter((query) => query.includes('"Application"'));
    expect(touching).toHaveLength(1);
    expect(touching[0]).toMatch(/^UPDATE "public"\."Application" SET/);
    expect(touching[0]).toMatch(/WHERE .*"scheduleId" = .*"status" <> /);
  });

  it('seatCountsBySchedule runs one grouped SELECT and splits seated from received by status', async () => {
    const { id: meetupId } = await prisma.meetup.create({
      data: { title: '오늘사이' },
    });
    const startsAt = new Date('2030-10-06T05:00:00Z');
    const { id: scheduleId } = await prisma.schedule.create({
      data: {
        meetupId,
        startsAt,
        endsAt: new Date('2030-10-06T07:00:00Z'),
        applyDeadlineAt: startsAt,
        priceMale: 0,
        priceFemale: 0,
        capacityMale: 7,
        capacityFemale: 7,
        venueArea: '성수',
      },
    });
    const rows = [
      ['MALE', 'APPLIED'],
      ['MALE', 'APPLIED'],
      ['MALE', 'PENDING'],
      ['MALE', 'CONFIRMED'],
      ['FEMALE', 'PENDING'],
      ['FEMALE', 'CANCELLED'],
    ] as const;
    await prisma.application.createMany({
      data: rows.map(([gender, status]) => ({
        scheduleId,
        memberId: randomUUID(),
        gender,
        price: 0,
        status,
        cancelledBy: status === 'CANCELLED' ? 'MEMBER' : null,
      })),
    });

    queries.length = 0;
    const counts = await seatCountsBySchedule(prisma, [scheduleId]);

    expect(counts.get(scheduleId)).toEqual({
      appliedMale: 2,
      receivedMale: 2,
      appliedFemale: 1,
      receivedFemale: 0,
    });
    const touching = queries.filter((query) => query.includes('"Application"'));
    expect(touching).toHaveLength(1);
    expect(touching[0]).toMatch(/^SELECT .*GROUP BY /);
  });

  it('SET LOCAL lock_timeout applies inside the transaction only', async () => {
    const inside = await prisma.$transaction(async (tx) => {
      await setLockTimeout(tx);
      return tx.$queryRaw<{ lock_timeout: string }[]>`SHOW lock_timeout`;
    });
    const after = await prisma.$queryRaw<
      { lock_timeout: string }[]
    >`SHOW lock_timeout`;

    expect(inside[0]?.lock_timeout).toBe('2s');
    expect(after[0]?.lock_timeout).toBe('0');
  });
});
