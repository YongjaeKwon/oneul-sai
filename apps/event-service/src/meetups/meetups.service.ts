import { SERVICE_NAMES } from '@oneul-sai/constants';
import {
  API_ERROR_CODES,
  type CreateMeetupRequest,
  type Meetup,
  type MeetupListQuery,
  type MeetupListResponse,
  type UpdateMeetupRequest,
} from '@oneul-sai/contracts';
import { createLogger, type Logger } from '@oneul-sai/logger';
import { apiError, type CallerUser } from '@oneul-sai/service-kit';
import type {
  Meetup as MeetupRow,
  PrismaClient,
} from '../generated/prisma/client.js';

// 모임 상품: 목록 · 등록 · 상세 · 수정 (SPEC-002 7절). 상태 · 삭제는 없다(6절).
// 제목 · 설명은 회차에 복사하지 않으므로 수정하면 그 상품의 모든 회차 응답에 반영된다(D1).

type MeetupsPrisma = Pick<PrismaClient, 'meetup'>;

const defaultLogger = createLogger({ service: SERVICE_NAMES.eventService });

export function toMeetup(row: MeetupRow): Meetup {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class MeetupsService {
  constructor(
    private readonly prisma: MeetupsPrisma,
    private readonly logger: Logger = defaultLogger,
  ) {}

  /** `createdAt` 내림차순. */
  async list(query: MeetupListQuery): Promise<MeetupListResponse> {
    const [rows, total] = await Promise.all([
      this.prisma.meetup.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.meetup.count(),
    ]);
    return {
      items: rows.map(toMeetup),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** `description`을 보내지 않으면 DB 기본값 `""`. */
  async create(
    admin: CallerUser,
    body: CreateMeetupRequest,
    requestId: string,
  ): Promise<Meetup> {
    const row = await this.prisma.meetup.create({ data: body });
    this.logger.info('meetup.created', {
      adminId: admin.id,
      meetupId: row.id,
      requestId,
    });
    return toMeetup(row);
  }

  async get(meetupId: string): Promise<Meetup> {
    return toMeetup(await this.find(meetupId));
  }

  /** 보낸 필드 중 저장된 값과 다른 것만 쓴다. 로그에는 바뀐 필드 이름만 남긴다(값 없음, 12절). */
  async update(
    admin: CallerUser,
    meetupId: string,
    body: UpdateMeetupRequest,
    requestId: string,
  ): Promise<Meetup> {
    const current = await this.find(meetupId);
    const fields = (['title', 'description'] as const).filter(
      (key) => body[key] !== undefined && body[key] !== current[key],
    );
    if (fields.length === 0) return toMeetup(current);

    const row = await this.prisma.meetup.update({
      where: { id: meetupId },
      data: Object.fromEntries(fields.map((key) => [key, body[key]])),
    });
    this.logger.info('meetup.updated', {
      adminId: admin.id,
      meetupId,
      fields,
      requestId,
    });
    return toMeetup(row);
  }

  private async find(meetupId: string): Promise<MeetupRow> {
    const row = await this.prisma.meetup.findUnique({
      where: { id: meetupId },
    });
    if (row === null) {
      throw apiError(
        404,
        API_ERROR_CODES.MEETUP_NOT_FOUND,
        '모임 상품을 찾을 수 없습니다.',
      );
    }
    return row;
  }
}
