import { API_ERROR_CODES } from '@oneul-sai/contracts';
import type { ApiHttpException, CallerUser } from '@oneul-sai/service-kit';
import type { Meetup as MeetupRow } from '../generated/prisma/client.js';
import { fakeLogger, loggedText } from '../testing/fakes.js';
import { MeetupsService } from './meetups.service.js';

// SPEC-002 13절 단위: MeetupsService — 목록 정렬, 수정 로그의 fields에 값 없음.

const NOW = new Date('2026-10-01T00:00:00.000Z');
const MEETUP_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const ADMIN: CallerUser = {
  id: '11111111-2222-4333-8444-555555555555',
  role: 'ADMIN',
};
const stored: MeetupRow = {
  id: MEETUP_ID,
  title: '오늘사이 로테이션 소개팅',
  description: '',
  createdAt: NOW,
  updatedAt: NOW,
};

function build(row: MeetupRow | null = stored) {
  const logger = fakeLogger();
  const meetup = {
    findMany: vi.fn(async () => (row === null ? [] : [row])),
    count: vi.fn(async () => (row === null ? 0 : 1)),
    findUnique: vi.fn(async () => row),
    update: vi.fn(async ({ data }: { data: Partial<MeetupRow> }) => ({
      ...stored,
      ...data,
    })),
  };
  const service = new MeetupsService(
    { meetup } as unknown as ConstructorParameters<typeof MeetupsService>[0],
    logger,
  );
  return { service, meetup, logger };
}

describe('MeetupsService', () => {
  it('lists by createdAt descending with page offsets', async () => {
    const { service, meetup } = build();
    const result = await service.list({ page: 2, pageSize: 20 });
    expect(meetup.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      skip: 20,
      take: 20,
    });
    expect(result).toMatchObject({ total: 1, page: 2, pageSize: 20 });
    expect(result.items[0]?.createdAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('updates only changed fields and logs their names without values', async () => {
    const { service, meetup, logger } = build();
    await service.update(
      ADMIN,
      MEETUP_ID,
      { title: stored.title, description: 'SECRET-DESCRIPTION' },
      'req',
    );
    expect(meetup.update).toHaveBeenCalledWith({
      where: { id: MEETUP_ID },
      data: { description: 'SECRET-DESCRIPTION' },
    });
    expect(logger.info).toHaveBeenCalledWith('meetup.updated', {
      adminId: ADMIN.id,
      meetupId: MEETUP_ID,
      fields: ['description'],
      requestId: 'req',
    });
    expect(loggedText(logger)).not.toContain('SECRET');
  });

  it('does not write when nothing changed', async () => {
    const { service, meetup, logger } = build();
    await service.update(ADMIN, MEETUP_ID, { title: stored.title }, 'req');
    expect(meetup.update).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('answers 404 MEETUP_NOT_FOUND', async () => {
    const { service } = build(null);
    const error = (await service
      .get(MEETUP_ID)
      .catch((e: unknown) => e)) as ApiHttpException;
    expect(error.getStatus()).toBe(404);
    expect(error.code).toBe(API_ERROR_CODES.MEETUP_NOT_FOUND);
  });
});
