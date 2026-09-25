import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import { dbErrorFields } from '../common/db-error.js';
import { resetTestDatabase } from '../testing/test-database.js';
import { PrismaService } from './prisma.service.js';

// 마이그레이션 add_application의 부분 유니크 인덱스 · CHECK · FK (SPEC-003 9절 · 13절).
// API를 거치지 않는 INSERT · UPDATE에서도 불변식이 서는지 실제 DB로 확인한다.

const prisma = new PrismaService(inject('testDatabaseUrl'));

type Status = 'PENDING' | 'CANCELLED';
type CancelledBy = 'MEMBER' | 'ADMIN' | 'SCHEDULE';

interface Row {
  memberId: string;
  price: number;
  status: Status;
  cancelledBy: CancelledBy | null;
}

let scheduleId: string;

function insert(overrides: Partial<Row> = {}, id = randomUUID()) {
  const r: Row = {
    memberId: randomUUID(),
    price: 39_000,
    status: 'PENDING',
    cancelledBy: null,
    ...overrides,
  };
  return prisma.$executeRaw`
    INSERT INTO "Application" (
      "id", "scheduleId", "memberId", "gender", "price", "status", "cancelledBy", "updatedAt"
    ) VALUES (
      ${id}, ${scheduleId}, ${r.memberId}, 'MALE'::"Gender", ${r.price},
      ${r.status}::"ApplicationStatus", ${r.cancelledBy}::"ApplicationCancelledBy", now()
    )`;
}

beforeEach(async () => {
  await resetTestDatabase(prisma);
  const { id: meetupId } = await prisma.meetup.create({
    data: { title: '오늘사이 로테이션 소개팅' },
  });
  const startsAt = new Date('2026-10-04T05:00:00Z');
  ({ id: scheduleId } = await prisma.schedule.create({
    data: {
      meetupId,
      startsAt,
      endsAt: new Date('2026-10-04T07:00:00Z'),
      applyDeadlineAt: startsAt,
      priceMale: 39_000,
      priceFemale: 29_000,
      capacityMale: 7,
      capacityFemale: 7,
      venueArea: '성수',
      status: 'OPEN',
    },
  }));
});

afterAll(async () => {
  await resetTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('Application partial unique index (integration)', () => {
  it('rejects a second active application for the same schedule and member with 23505 on Application_active_member_key', async () => {
    const memberId = randomUUID();
    await insert({ memberId });

    const error = await insert({ memberId }).catch((e: unknown) => e);

    expect(dbErrorFields(error)).toMatchObject({
      sqlState: '23505',
      constraint: 'Application_active_member_key',
    });
  });

  it('allows any number of cancelled rows next to one active row for the same pair', async () => {
    const memberId = randomUUID();
    await insert({ memberId, status: 'CANCELLED', cancelledBy: 'MEMBER' });
    await insert({ memberId, status: 'CANCELLED', cancelledBy: 'ADMIN' });

    await expect(insert({ memberId })).resolves.toBe(1);
  });

  it('blocks reviving a cancelled row while another active row exists (J-2)', async () => {
    const memberId = randomUUID();
    const cancelledId = randomUUID();
    await insert(
      { memberId, status: 'CANCELLED', cancelledBy: 'ADMIN' },
      cancelledId,
    );
    await insert({ memberId });

    const error = await prisma.$executeRaw`
      UPDATE "Application" SET "status" = 'PENDING', "cancelledBy" = NULL, "updatedAt" = now()
      WHERE "id" = ${cancelledId} AND "status" = 'CANCELLED'`.catch(
      (e: unknown) => e,
    );

    expect(dbErrorFields(error)).toMatchObject({
      sqlState: '23505',
      constraint: 'Application_active_member_key',
    });
  });

  it('lets different members hold active applications on the same schedule', async () => {
    await insert();
    await expect(insert()).resolves.toBe(1);
  });
});

describe('Application CHECK constraints (integration)', () => {
  it.each<[string, string, Partial<Row>]>([
    ['price -1', 'Application_price_valid', { price: -1 }],
    [
      'CANCELLED without cancelledBy',
      'Application_cancelled_by',
      { status: 'CANCELLED', cancelledBy: null },
    ],
    [
      'PENDING with cancelledBy',
      'Application_cancelled_by',
      { status: 'PENDING', cancelledBy: 'MEMBER' },
    ],
  ])('INSERT %s → %s', async (_label, constraint, row) => {
    const error = await insert(row).catch((e: unknown) => e);
    expect(dbErrorFields(error)).toMatchObject({
      sqlState: '23514',
      constraint,
    });
  });

  it('rejects cancelling without a cancelledBy through a direct UPDATE', async () => {
    const id = randomUUID();
    await insert({}, id);

    const error = await prisma.$executeRaw`
      UPDATE "Application" SET "status" = 'CANCELLED' WHERE "id" = ${id}`.catch(
      (e: unknown) => e,
    );

    expect(dbErrorFields(error)).toMatchObject({
      sqlState: '23514',
      constraint: 'Application_cancelled_by',
    });
  });

  it.each<[string, Partial<Row>]>([
    ['price 0', { price: 0 }],
    ['CANCELLED by SCHEDULE', { status: 'CANCELLED', cancelledBy: 'SCHEDULE' }],
  ])('accepts %s', async (_label, row) => {
    await expect(insert(row)).resolves.toBe(1);
  });
});

describe('Application foreign key (integration)', () => {
  it('keeps a schedule that has applications from being deleted', async () => {
    await insert();

    const error = await prisma.schedule
      .delete({ where: { id: scheduleId } })
      .catch((e: unknown) => e);

    expect(dbErrorFields(error)).toMatchObject({ prismaCode: 'P2003' });
    await expect(
      prisma.schedule.count({ where: { id: scheduleId } }),
    ).resolves.toBe(1);
  });
});
