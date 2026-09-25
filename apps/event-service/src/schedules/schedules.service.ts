import { SERVICE_NAMES } from '@oneul-sai/constants';
import {
  AdminScheduleSchema,
  API_ERROR_CODES,
  type AdminSchedule,
  type AdminScheduleListQuery,
  type AdminScheduleListResponse,
  type ApiErrorCode,
  type BatchCreateSchedulesRequest,
  type BatchCreateSchedulesResponse,
  type CreateScheduleRequest,
  type UpdateScheduleRequest,
  type UpdateScheduleStatusRequest,
} from '@oneul-sai/contracts';
import { createLogger, type Logger } from '@oneul-sai/logger';
import { apiError, type CallerUser } from '@oneul-sai/service-kit';
import {
  activeCountsBySchedule,
  cancelActiveForSchedule,
  countActive,
  NO_APPLICATIONS,
  seatsOf,
  type ApplicationCounts,
} from '../applications/application-queries.js';
import { busyAsServiceUnavailable, setLockTimeout } from '../common/db-lock.js';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  changedFields,
  decideTransition,
  scheduleRuleViolation,
  TIME_FIELDS,
  withDates,
  type ScheduleAction,
  type ScheduleRuleViolation,
} from './schedule-rules.js';
import {
  ADMIN_SCHEDULE_SELECT,
  flattenScheduleRow,
  type AdminScheduleRow,
} from './schedule-select.js';

// 운영자 회차: 목록 · 생성 · 여러 회차 등록 · 상세 · 수정 · 상태 · 삭제 (SPEC-002 7 · 10 · 11절).
// 수정 · 상태 · 삭제는 한 트랜잭션에서 `SELECT ... FOR UPDATE`로 잠근 뒤 판정한다. 여러 회차 등록은 규칙 판정을
// 트랜잭션 밖에서 끝내고 한 트랜잭션에서 INSERT만 한다(D15). 로그에는 식별자와 바뀐 필드 이름만 남긴다(12절).
// SPEC-003 D8: 정원을 줄이면 잠금 뒤 활성 신청 수와 비교하고, 회차를 취소하면 같은 트랜잭션에서 신청을 함께 취소한다.
// 잠금 대기는 2초가 상한이다(D3) — 넘으면 503. 신청 테이블은 applications 모듈의 함수로만 건드린다.

type SchedulesPrisma = Pick<
  PrismaClient,
  'meetup' | 'schedule' | 'application' | '$transaction'
>;

const defaultLogger = createLogger({ service: SERVICE_NAMES.eventService });

const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  [API_ERROR_CODES.SCHEDULE_TIME_INVALID]: '일시가 규칙에 맞지 않습니다.',
  [API_ERROR_CODES.BIRTH_YEAR_RANGE_INVALID]:
    '남성 연령대의 앞 연도가 뒤 연도보다 클 수 없습니다.',
  [API_ERROR_CODES.INVALID_STATUS_TRANSITION]:
    '지금 상태에서는 바꿀 수 없습니다.',
  [API_ERROR_CODES.SCHEDULE_NOT_EDITABLE]:
    '지금 상태에서는 고치거나 삭제할 수 없습니다.',
  [API_ERROR_CODES.CAPACITY_BELOW_APPLICATIONS]:
    '정원을 지금 신청한 인원보다 적게 줄일 수 없습니다.',
};

/** 여러 회차 등록의 서비스 규칙 위반 `message` = `items.<순번>: <규칙 이름>`(첫 위반 항목 하나, D15). */
const RULE_NAMES: Record<ScheduleRuleViolation, string> = {
  [API_ERROR_CODES.SCHEDULE_TIME_INVALID]: '시간 규칙',
  [API_ERROR_CODES.BIRTH_YEAR_RANGE_INVALID]: '연령대 규칙',
};

/** 신청 수를 붙여 운영자 응답으로 — 네 값(`applied*` · `*Full`)은 모든 운영자 회차 응답에 실린다(SPEC-003 D10). */
export function toAdminSchedule(
  row: AdminScheduleRow,
  counts: ApplicationCounts = NO_APPLICATIONS,
): AdminSchedule {
  return AdminScheduleSchema.parse({
    ...flattenScheduleRow(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...seatsOf(row, counts),
  });
}

/** 한 회차의 신청 수. 트랜잭션 안에서 부르면 그 트랜잭션이 바꾼 것(연쇄 취소)까지 보인다. */
async function countsOf(
  db: Pick<Prisma.TransactionClient, 'application'>,
  scheduleId: string,
): Promise<ApplicationCounts> {
  return (
    (await activeCountsBySchedule(db, [scheduleId])).get(scheduleId) ??
    NO_APPLICATIONS
  );
}

function reject(status: number, code: ApiErrorCode) {
  return apiError(status, code, MESSAGES[code] ?? '요청을 처리할 수 없습니다.');
}

const scheduleNotFound = () =>
  apiError(404, API_ERROR_CODES.SCHEDULE_NOT_FOUND, '회차를 찾을 수 없습니다.');

export interface SchedulesServiceOptions {
  logger?: Logger;
  now?: () => Date;
}

export class SchedulesService {
  private readonly logger: Logger;
  private readonly now: () => Date;

  constructor(
    private readonly prisma: SchedulesPrisma,
    options: SchedulesServiceOptions = {},
  ) {
    this.logger = options.logger ?? defaultLogger;
    this.now = options.now ?? (() => new Date());
  }

  /** 그 상품의 회차 전부(모든 상태). `startsAt`이 `[from, to)`, `startsAt` · `id` 오름차순. */
  async list(
    meetupId: string,
    query: AdminScheduleListQuery,
  ): Promise<AdminScheduleListResponse> {
    await this.assertMeetup(meetupId);
    const where: Prisma.ScheduleWhereInput = {
      meetupId,
      status: query.status,
      startsAt: {
        gte: query.from === undefined ? undefined : new Date(query.from),
        lt: query.to === undefined ? undefined : new Date(query.to),
      },
    };
    const [rows, total] = await Promise.all([
      this.prisma.schedule.findMany({
        where,
        select: ADMIN_SCHEDULE_SELECT,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.schedule.count({ where }),
    ]);
    const counts = await activeCountsBySchedule(
      this.prisma,
      rows.map((row) => row.id),
    );
    return {
      items: rows.map((row) => toAdminSchedule(row, counts.get(row.id))),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 결과는 항상 DRAFT(DB 기본값). 선택 필드를 보내지 않으면 NULL. */
  async create(
    admin: CallerUser,
    meetupId: string,
    body: CreateScheduleRequest,
    requestId: string,
  ): Promise<AdminSchedule> {
    await this.assertMeetup(meetupId);
    const values = withDates(body);
    const violation = scheduleRuleViolation(values, TIME_FIELDS, this.now());
    if (violation !== null) throw reject(400, violation);

    const row = await this.prisma.schedule.create({
      data: { ...values, meetupId },
      select: ADMIN_SCHEDULE_SELECT,
    });
    this.logCreated(admin, row, requestId);
    return toAdminSchedule(row);
  }

  /**
   * 여러 회차 등록(D15): 상품 존재(404) → 같은 `now`로 항목마다 규칙(요청 순서, 첫 위반에서 400) →
   * 한 트랜잭션에서 요청 순서대로 INSERT(전부 DRAFT). 하나라도 실패하면 아무것도 남지 않는다. 로그는 커밋 뒤에만.
   */
  async createBatch(
    admin: CallerUser,
    meetupId: string,
    body: BatchCreateSchedulesRequest,
    requestId: string,
  ): Promise<BatchCreateSchedulesResponse> {
    await this.assertMeetup(meetupId);
    const now = this.now();
    const items = body.items.map((item) => withDates(item));
    items.forEach((values, index) => {
      const violation = scheduleRuleViolation(values, TIME_FIELDS, now);
      if (violation !== null) {
        throw apiError(
          400,
          violation,
          `items.${index}: ${RULE_NAMES[violation]}`,
        );
      }
    });

    const rows = await busyAsServiceUnavailable(
      this.prisma.$transaction(async (tx) => {
        const created: AdminScheduleRow[] = [];
        for (const values of items) {
          created.push(
            await tx.schedule.create({
              data: { ...values, meetupId },
              select: ADMIN_SCHEDULE_SELECT,
            }),
          );
        }
        return created;
      }),
    );
    for (const row of rows) this.logCreated(admin, row, requestId);
    // 새 회차에는 신청이 없다
    return { items: rows.map((row) => toAdminSchedule(row)) };
  }

  /** `scheduleId`가 경로의 `meetupId`에 속하지 않으면 404. */
  async get(meetupId: string, scheduleId: string): Promise<AdminSchedule> {
    const row = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, meetupId },
      select: ADMIN_SCHEDULE_SELECT,
    });
    if (row === null) throw scheduleNotFound();
    return toAdminSchedule(row, await countsOf(this.prisma, row.id));
  }

  /**
   * 잠금 → CANCELLED면 409 → 저장된 값과 병합 → 시간 · 연령대 규칙 → 정원을 바꾸면 그 성별 활성 신청 수와 비교(D8) →
   * 바뀐 필드만 UPDATE.
   */
  async update(
    admin: CallerUser,
    meetupId: string,
    scheduleId: string,
    body: UpdateScheduleRequest,
    requestId: string,
  ): Promise<AdminSchedule> {
    const { row, fields, counts } = await busyAsServiceUnavailable(
      this.prisma.$transaction(async (tx) => {
        const current = await this.lock(tx, meetupId, scheduleId);
        // 잠금을 기다린 뒤의 시각으로 판정한다
        const now = this.now();
        this.assertAllowed(current, 'PATCH', now);

        const patch = withDates(body);
        const fields = changedFields(current, patch);
        const data = Object.fromEntries(
          fields.map((key) => [key, patch[key]]),
        ) as typeof patch;
        const violation = scheduleRuleViolation(
          { ...current, ...data },
          fields,
          now,
        );
        if (violation !== null) throw reject(400, violation);
        // 신청과 같은 회차 행 잠금 뒤에 세므로, 그 사이에 신청이 끼어들어 정원을 넘지 못한다(11절)
        if (
          data.capacityMale !== undefined &&
          data.capacityMale < (await countActive(tx, current.id, 'MALE'))
        ) {
          throw reject(409, API_ERROR_CODES.CAPACITY_BELOW_APPLICATIONS);
        }
        if (
          data.capacityFemale !== undefined &&
          data.capacityFemale < (await countActive(tx, current.id, 'FEMALE'))
        ) {
          throw reject(409, API_ERROR_CODES.CAPACITY_BELOW_APPLICATIONS);
        }
        const row =
          fields.length === 0
            ? current
            : await tx.schedule.update({
                where: { id: current.id },
                data,
                select: ADMIN_SCHEDULE_SELECT,
              });
        return { row, fields, counts: await countsOf(tx, current.id) };
      }),
    );
    if (fields.length > 0) {
      this.logger.info('schedule.updated', {
        adminId: admin.id,
        meetupId,
        scheduleId,
        status: row.status,
        fields,
        requestId,
      });
    }
    return toAdminSchedule(row, counts);
  }

  /**
   * 6절 전이 표. 같은 상태는 아무것도 바꾸지 않고 200(CANCELLED의 사유도 그대로). 취소 사유는 로그에 남기지 않는다.
   * → CANCELLED면 같은 트랜잭션에서 그 회차의 활성 신청을 모두 취소한다(SPEC-003 D8).
   */
  async updateStatus(
    admin: CallerUser,
    meetupId: string,
    scheduleId: string,
    body: UpdateScheduleStatusRequest,
    requestId: string,
  ): Promise<AdminSchedule> {
    const { row, from, cancelledApplications, counts } =
      await busyAsServiceUnavailable(
        this.prisma.$transaction(async (tx) => {
          const current = await this.lock(tx, meetupId, scheduleId);
          if (this.assertAllowed(current, body.status, this.now()) === 'noop') {
            return {
              row: current,
              from: null,
              cancelledApplications: 0,
              counts: await countsOf(tx, current.id),
            };
          }
          const row = await tx.schedule.update({
            where: { id: current.id },
            data: { status: body.status, cancelReason: body.cancelReason },
            select: ADMIN_SCHEDULE_SELECT,
          });
          const cancelledApplications =
            body.status === 'CANCELLED'
              ? await cancelActiveForSchedule(tx, current.id)
              : 0;
          return {
            row,
            from: current.status,
            cancelledApplications,
            counts: await countsOf(tx, current.id),
          };
        }),
      );
    if (from !== null) {
      this.logger.info('schedule.status_changed', {
        adminId: admin.id,
        meetupId,
        scheduleId,
        from,
        to: row.status,
        ...(row.status === 'CANCELLED' && { cancelledApplications }),
        requestId,
      });
    }
    return toAdminSchedule(row, counts);
  }

  /** DRAFT만 삭제한다(공개한 적 없는 것만 흔적 없이, D8). */
  async remove(
    admin: CallerUser,
    meetupId: string,
    scheduleId: string,
    requestId: string,
  ): Promise<void> {
    await busyAsServiceUnavailable(
      this.prisma.$transaction(async (tx) => {
        const current = await this.lock(tx, meetupId, scheduleId);
        this.assertAllowed(current, 'DELETE', this.now());
        await tx.schedule.delete({ where: { id: current.id } });
      }),
    );
    this.logger.info('schedule.deleted', {
      adminId: admin.id,
      meetupId,
      scheduleId,
      requestId,
    });
  }

  /**
   * `SELECT ... FOR UPDATE`로 행을 잠근다 — 같은 회차의 수정 · 상태 · 삭제 · 신청이 직렬화된다(11절). 다른 상품의 회차면 404.
   * 잠금 대기는 2초가 상한이다(SPEC-003 D3).
   */
  private async lock(
    tx: Prisma.TransactionClient,
    meetupId: string,
    scheduleId: string,
  ): Promise<AdminScheduleRow> {
    await setLockTimeout(tx);
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Schedule" WHERE "id" = ${scheduleId} AND "meetupId" = ${meetupId} FOR UPDATE`;
    if (locked.length === 0) throw scheduleNotFound();
    return tx.schedule.findUniqueOrThrow({
      where: { id: scheduleId },
      select: ADMIN_SCHEDULE_SELECT,
    });
  }

  private assertAllowed(
    current: AdminScheduleRow,
    action: ScheduleAction,
    now: Date,
  ): 'change' | 'noop' {
    const decision = decideTransition(
      current.status,
      action,
      current.applyDeadlineAt,
      now,
    );
    if (decision.kind === 'reject')
      throw reject(decision.status, decision.code);
    return decision.kind;
  }

  /** 생성 · 목록 · 여러 회차 등록의 상품 존재 확인. 상품은 잠그지 않는다 — 삭제가 없고 FK가 최종 방어선이다(10절). */
  private async assertMeetup(meetupId: string): Promise<void> {
    const meetup = await this.prisma.meetup.findUnique({
      where: { id: meetupId },
      select: { id: true },
    });
    if (meetup === null) {
      throw apiError(
        404,
        API_ERROR_CODES.MEETUP_NOT_FOUND,
        '모임 상품을 찾을 수 없습니다.',
      );
    }
  }

  private logCreated(
    admin: CallerUser,
    row: AdminScheduleRow,
    requestId: string,
  ): void {
    this.logger.info('schedule.created', {
      adminId: admin.id,
      meetupId: row.meetupId,
      scheduleId: row.id,
      requestId,
    });
  }
}
