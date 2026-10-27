import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import { dbErrorFields } from '../common/db-error.js';
import { resetTestDatabase } from '../testing/test-database.js';
import { PrismaService } from './prisma.service.js';

// 마이그레이션 init_event · add_schedule_condition_columns에 손으로 넣은 CHECK 제약 (SPEC-002 9절 · 13절).
// API를 거치지 않는 INSERT · UPDATE에서도 불변식이 서는지 실제 DB로 확인한다.

const prisma = new PrismaService(inject('testDatabaseUrl'));

interface Row {
  startsAt: Date;
  endsAt: Date;
  applyDeadlineAt: Date;
  priceMale: number;
  priceFemale: number;
  capacityMale: number;
  capacityFemale: number;
  maleMinBirthYear: number | null;
  maleMaxBirthYear: number | null;
  femaleMinBirthYear: number | null;
  femaleMaxBirthYear: number | null;
  minPerGender: number | null;
  venueMapUrl: string | null;
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED';
  cancelReason: string | null;
}

const startsAt = new Date('2026-10-04T05:00:00Z');
const valid: Row = {
  startsAt,
  endsAt: new Date('2026-10-04T07:00:00Z'),
  applyDeadlineAt: startsAt,
  priceMale: 39_000,
  priceFemale: 29_000,
  capacityMale: 7,
  capacityFemale: 6,
  maleMinBirthYear: null,
  maleMaxBirthYear: null,
  femaleMinBirthYear: null,
  femaleMaxBirthYear: null,
  minPerGender: null,
  venueMapUrl: null,
  status: 'DRAFT',
  cancelReason: null,
};

let meetupId: string;

function insert(overrides: Partial<Row>, id = randomUUID()) {
  const r = { ...valid, ...overrides };
  return prisma.$executeRaw`
    INSERT INTO "Schedule" (
      "id", "meetupId", "startsAt", "endsAt", "applyDeadlineAt",
      "priceMale", "priceFemale", "capacityMale", "capacityFemale",
      "maleMinBirthYear", "maleMaxBirthYear", "femaleMinBirthYear", "femaleMaxBirthYear",
      "minPerGender", "venueArea", "venueMapUrl",
      "status", "cancelReason", "updatedAt"
    ) VALUES (
      ${id}, ${meetupId}, ${r.startsAt}, ${r.endsAt}, ${r.applyDeadlineAt},
      ${r.priceMale}, ${r.priceFemale}, ${r.capacityMale}, ${r.capacityFemale},
      ${r.maleMinBirthYear}, ${r.maleMaxBirthYear}, ${r.femaleMinBirthYear}, ${r.femaleMaxBirthYear},
      ${r.minPerGender}, '성수', ${r.venueMapUrl},
      ${r.status}::"ScheduleStatus", ${r.cancelReason}, now()
    )`;
}

function update(id: string, overrides: Partial<Row>) {
  const r = { ...valid, ...overrides };
  return prisma.$executeRaw`
    UPDATE "Schedule" SET
      "startsAt" = ${r.startsAt}, "endsAt" = ${r.endsAt}, "applyDeadlineAt" = ${r.applyDeadlineAt},
      "priceMale" = ${r.priceMale}, "priceFemale" = ${r.priceFemale},
      "capacityMale" = ${r.capacityMale}, "capacityFemale" = ${r.capacityFemale},
      "maleMinBirthYear" = ${r.maleMinBirthYear}, "maleMaxBirthYear" = ${r.maleMaxBirthYear},
      "femaleMinBirthYear" = ${r.femaleMinBirthYear}, "femaleMaxBirthYear" = ${r.femaleMaxBirthYear},
      "minPerGender" = ${r.minPerGender},
      "venueMapUrl" = ${r.venueMapUrl},
      "status" = ${r.status}::"ScheduleStatus", "cancelReason" = ${r.cancelReason}
    WHERE "id" = ${id}`;
}

beforeEach(async () => {
  await resetTestDatabase(prisma);
  ({ id: meetupId } = await prisma.meetup.create({
    data: { title: '오늘사이 로테이션 소개팅' },
  }));
});

afterAll(async () => {
  await resetTestDatabase(prisma);
  await prisma.$disconnect();
});

const violations: [string, string, Partial<Row>][] = [
  ['capacityMale 0', 'Schedule_capacity_valid', { capacityMale: 0 }],
  ['capacityFemale 51', 'Schedule_capacity_valid', { capacityFemale: 51 }],
  ['priceMale -1', 'Schedule_price_valid', { priceMale: -1 }],
  ['priceFemale -1', 'Schedule_price_valid', { priceFemale: -1 }],
  [
    'applyDeadlineAt > startsAt',
    'Schedule_time_order',
    { applyDeadlineAt: new Date('2026-10-04T05:00:00.001Z') },
  ],
  ['startsAt = endsAt', 'Schedule_time_order', { endsAt: startsAt }],
  [
    'maleMinBirthYear > maleMaxBirthYear',
    'Schedule_male_birth_year_valid',
    { maleMinBirthYear: 1995, maleMaxBirthYear: 1990 },
  ],
  [
    'maleMinBirthYear 1899',
    'Schedule_male_birth_year_valid',
    { maleMinBirthYear: 1899 },
  ],
  // 개정 2026-10-14 (D16 · D17)
  [
    'femaleMinBirthYear > femaleMaxBirthYear',
    'Schedule_female_birth_year_valid',
    { femaleMinBirthYear: 1995, femaleMaxBirthYear: 1990 },
  ],
  [
    'femaleMinBirthYear 1899',
    'Schedule_female_birth_year_valid',
    { femaleMinBirthYear: 1899 },
  ],
  [
    'femaleMaxBirthYear 1899',
    'Schedule_female_birth_year_valid',
    { femaleMaxBirthYear: 1899 },
  ],
  ['minPerGender 0', 'Schedule_min_per_gender_valid', { minPerGender: 0 }],
  ['minPerGender 51', 'Schedule_min_per_gender_valid', { minPerGender: 51 }],
  [
    "venueMapUrl 'javascript:alert(1)'",
    'Schedule_venue_map_url_https',
    { venueMapUrl: 'javascript:alert(1)' },
  ],
  [
    'CANCELLED without cancelReason',
    'Schedule_cancel_reason',
    { status: 'CANCELLED', cancelReason: null },
  ],
  [
    'OPEN with cancelReason',
    'Schedule_cancel_reason',
    { status: 'OPEN', cancelReason: '사유' },
  ],
];

describe('Schedule CHECK constraints (integration)', () => {
  it.each(violations)('INSERT %s → %s', async (_label, constraint, row) => {
    await expect(insert(row)).rejects.toThrow(constraint);
  });

  it.each(violations)('UPDATE %s → %s', async (_label, constraint, row) => {
    const id = randomUUID();
    await insert({}, id);
    await expect(update(id, row)).rejects.toThrow(constraint);
  });

  // 로그 필터(common/db-error.ts)가 실제 Prisma 7 + PrismaPg 에러에서 식별자를 꺼내는지 — 가짜 에러 모양이 어긋나면 여기서 깨진다
  it('dbErrorFields reads SQLSTATE and the constraint name from a real CHECK violation', async () => {
    const error = await prisma.schedule
      .create({
        data: {
          meetupId,
          startsAt,
          endsAt: valid.endsAt,
          applyDeadlineAt: startsAt,
          priceMale: -1,
          priceFemale: 0,
          capacityMale: 7,
          capacityFemale: 7,
          venueArea: '성수',
          venueName: 'SECRET-VENUE',
        },
      })
      .catch((e: unknown) => e);

    const fields = dbErrorFields(error);
    expect(fields).toMatchObject({
      sqlState: '23514',
      constraint: 'Schedule_price_valid',
    });
    expect(JSON.stringify(fields)).not.toContain('SECRET-VENUE');
  });

  // 제약이 과하지 않은지 — 경계값과 선택 필드는 통과한다
  it.each<[string, Partial<Row>]>([
    ['defaults (applyDeadlineAt = startsAt, men and women differ)', {}],
    [
      'price 0 · capacity 1 and 50',
      { priceMale: 0, capacityMale: 1, capacityFemale: 50 },
    ],
    [
      'male birth years 1900 · min = max',
      { maleMinBirthYear: 1900, maleMaxBirthYear: 1900 },
    ],
    ['only maleMaxBirthYear', { maleMaxBirthYear: 1995 }],
    [
      'female birth years 1900 · min = max',
      { femaleMinBirthYear: 1900, femaleMaxBirthYear: 1900 },
    ],
    ['only femaleMinBirthYear', { femaleMinBirthYear: 1990 }],
    [
      'male and female ranges that differ',
      {
        maleMinBirthYear: 1990,
        maleMaxBirthYear: 1995,
        femaleMinBirthYear: 1985,
        femaleMaxBirthYear: 1999,
      },
    ],
    ['minPerGender 1', { minPerGender: 1 }],
    ['minPerGender 50 (above capacity 7 — no relation)', { minPerGender: 50 }],
    ['https map url', { venueMapUrl: 'https://naver.me/abc' }],
    ['CANCELLED with reason', { status: 'CANCELLED', cancelReason: '사유' }],
  ])('accepts %s', async (_label, row) => {
    await expect(insert(row)).resolves.toBe(1);
  });
});
