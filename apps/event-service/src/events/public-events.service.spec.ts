import {
  AdminScheduleSchema,
  API_ERROR_CODES,
  PublicScheduleSchema,
} from '@oneul-sai/contracts';
import type { ApiHttpException } from '@oneul-sai/service-kit';
import { PUBLIC_SCHEDULE_SELECT } from '../schedules/schedule-select.js';
import { PublicEventsService } from './public-events.service.js';

// SPEC-002 13절 단위 "공개 필드 격리"(12절 네 겹 중 2 · 3번을 코드로 고정한다).

const PRIVATE_KEYS = [
  'venueName',
  'venueAddress',
  'venueDirections',
  'venueMapUrl',
  'cancelReason',
  'meetupId',
];
const NOW = new Date('2026-10-01T00:00:00.000Z');
const ID = '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01';

/** 공개 select 모양의 행 + select에 없어야 할 비공개 열(누군가 select에 더했다고 가정). */
const leakyRow = {
  id: ID,
  startsAt: new Date('2026-10-04T05:00:00Z'),
  endsAt: new Date('2026-10-04T07:00:00Z'),
  applyDeadlineAt: new Date('2026-10-04T05:00:00Z'),
  priceMale: 39_000,
  priceFemale: 29_000,
  capacityMale: 7,
  capacityFemale: 6,
  maleMinBirthYear: 1990,
  maleMaxBirthYear: null,
  venueArea: '성수',
  status: 'OPEN' as const,
  meetup: { title: '오늘사이', description: '' },
  meetupId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  venueName: 'SECRET-NAME',
  venueAddress: 'SECRET-ADDRESS',
  venueDirections: 'SECRET-DIRECTIONS',
  venueMapUrl: 'https://naver.me/SECRET',
  cancelReason: 'SECRET-REASON',
};

function build(row: typeof leakyRow | null) {
  const schedule = {
    findMany: vi.fn(async () => (row === null ? [] : [row])),
    count: vi.fn(async () => (row === null ? 0 : 1)),
    findFirst: vi.fn(async () => row),
  };
  const service = new PublicEventsService(
    { schedule } as unknown as ConstructorParameters<
      typeof PublicEventsService
    >[0],
    () => NOW,
  );
  return { service, schedule };
}

describe('public field isolation', () => {
  it('PublicScheduleSchema has no private keys', () => {
    const keys = Object.keys(PublicScheduleSchema.shape);
    for (const key of PRIVATE_KEYS) expect(keys).not.toContain(key);
  });

  it('PUBLIC_SCHEDULE_SELECT has no private columns', () => {
    const keys = Object.keys(PUBLIC_SCHEDULE_SELECT);
    for (const key of PRIVATE_KEYS) expect(keys).not.toContain(key);
  });

  it('AdminScheduleSchema widens the public schema (contains every public key)', () => {
    const adminKeys = Object.keys(AdminScheduleSchema.shape);
    for (const key of Object.keys(PublicScheduleSchema.shape)) {
      expect(adminKeys).toContain(key);
    }
  });

  it('strips private keys that slipped into a row (list and detail)', async () => {
    const { service } = build(leakyRow);
    const list = await service.list({ page: 1, pageSize: 20 });
    const detail = await service.detail(ID);
    for (const response of [list.items[0], detail]) {
      for (const key of PRIVATE_KEYS) expect(response).not.toHaveProperty(key);
      expect(response).not.toHaveProperty('meetup');
    }
    expect(JSON.stringify([list, detail])).not.toContain('SECRET');
    expect(detail).toMatchObject({
      title: '오늘사이',
      startsAt: '2026-10-04T05:00:00.000Z',
      capacityFemale: 6,
    });
  });
});

describe('PublicEventsService queries', () => {
  it('lists OPEN · CLOSED from now, ordered by startsAt then id, with the public select', async () => {
    const { service, schedule } = build(leakyRow);
    await service.list({ page: 3, pageSize: 10 });
    expect(schedule.findMany).toHaveBeenCalledWith({
      where: { status: { in: ['OPEN', 'CLOSED'] }, startsAt: { gte: NOW } },
      select: PUBLIC_SCHEDULE_SELECT,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      skip: 20,
      take: 10,
    });
  });

  it('answers 404 SCHEDULE_NOT_FOUND when no public row matches', async () => {
    const { service, schedule } = build(null);
    const error = await service.detail(ID).catch((e: unknown) => e);
    expect((error as ApiHttpException).getStatus()).toBe(404);
    expect((error as ApiHttpException).code).toBe(
      API_ERROR_CODES.SCHEDULE_NOT_FOUND,
    );
    expect(schedule.findFirst).toHaveBeenCalledWith({
      where: { id: ID, status: { in: ['OPEN', 'CLOSED'] } },
      select: PUBLIC_SCHEDULE_SELECT,
    });
  });
});
