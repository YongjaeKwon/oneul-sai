import {
  API_ERROR_CODES,
  PUBLIC_SCHEDULE_STATUSES,
  PublicScheduleSchema,
  type PublicSchedule,
  type PublicScheduleListQuery,
  type PublicScheduleListResponse,
} from '@oneul-sai/contracts';
import { apiError } from '@oneul-sai/service-kit';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  flattenScheduleRow,
  PUBLIC_SCHEDULE_SELECT,
  type PublicScheduleRow,
} from '../schedules/schedule-select.js';

// 참가자 공개 조회만 (SPEC-002 7절 · 12절). 공개 select와 공개 스키마만 쓴다 — 운영자 select · 스키마를 알지 못한다.
// 공개 응답은 역할에 따라 바뀌지 않는다(D9). DRAFT · CANCELLED · 없음은 같은 본문의 404다(D14).

type EventsPrisma = Pick<PrismaClient, 'schedule'>;

const PUBLIC_STATUS_WHERE = {
  status: { in: [...PUBLIC_SCHEDULE_STATUSES] },
} satisfies Prisma.ScheduleWhereInput;

/** 응답 스키마가 모르는 키(비공개 열이 select에 섞여도)를 떼어 낸다 — 12절 세 번째 겹. */
export function toPublicSchedule(row: PublicScheduleRow): PublicSchedule {
  return PublicScheduleSchema.parse(flattenScheduleRow(row));
}

export class PublicEventsService {
  constructor(
    private readonly prisma: EventsPrisma,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** OPEN · CLOSED이고 시작 전. `startsAt` · `id` 오름차순(페이지 경계가 흔들리지 않게). */
  async list(
    query: PublicScheduleListQuery,
  ): Promise<PublicScheduleListResponse> {
    const where: Prisma.ScheduleWhereInput = {
      ...PUBLIC_STATUS_WHERE,
      startsAt: { gte: this.now() },
    };
    const [rows, total] = await Promise.all([
      this.prisma.schedule.findMany({
        where,
        select: PUBLIC_SCHEDULE_SELECT,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.schedule.count({ where }),
    ]);
    return {
      items: rows.map(toPublicSchedule),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** OPEN · CLOSED면 시작 시각과 무관하게 200(지난 일정 링크가 깨지지 않게). */
  async detail(id: string): Promise<PublicSchedule> {
    const row = await this.prisma.schedule.findFirst({
      where: { id, ...PUBLIC_STATUS_WHERE },
      select: PUBLIC_SCHEDULE_SELECT,
    });
    if (row === null) {
      throw apiError(
        404,
        API_ERROR_CODES.SCHEDULE_NOT_FOUND,
        '일정을 찾을 수 없습니다.',
      );
    }
    return toPublicSchedule(row);
  }
}
