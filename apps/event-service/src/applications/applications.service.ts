import { SERVICE_NAMES } from '@oneul-sai/constants';
import {
  AdminApplicationSchema,
  API_ERROR_CODES,
  MyApplicationSchema,
  type AdminApplication,
  type AdminApplicationListQuery,
  type AdminApplicationListResponse,
  type ApiErrorCode,
  type CreateApplicationRequest,
  type MyApplication,
  type MyApplicationListQuery,
  type MyApplicationListResponse,
} from '@oneul-sai/contracts';
import { createLogger, type Logger } from '@oneul-sai/logger';
import { apiError, type CallerUser } from '@oneul-sai/service-kit';
import { dbErrorFields } from '../common/db-error.js';
import {
  busyAsServiceUnavailable,
  setLockTimeout,
  type BusyCause,
} from '../common/db-lock.js';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { MemberLookup } from '../members/member-client.js';
import { countActive } from './application-queries.js';
import {
  decideApply,
  decideCancel,
  type Rejection,
} from './application-rules.js';

// SPEC-003 7 · 10 · 11절: 신청 · 내 신청 · 본인 취소, 운영자 신청 목록 · 운영자 취소.
// 신청은 위임 호출(트랜잭션 밖) → 한 트랜잭션 { lock_timeout → 회차 행 FOR UPDATE → 회차 · now · 내 신청 · 입금 대기 ·
// 성별 집계를 각각 별도 문장으로 → 판정 → INSERT }. 취소는 신청 행만 잠근다(자리를 줄이기만 한다).
// 로그는 커밋 뒤에만, 식별자만 남긴다 — 거절 로그에는 memberId가 없다(결과가 성별 · 출생연도를 드러낸다, 12절).

type ApplicationsPrisma = Pick<
  PrismaClient,
  'schedule' | 'application' | '$transaction'
>;

const defaultLogger = createLogger({ service: SERVICE_NAMES.eventService });

const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  // 없음 · DRAFT · CANCELLED — 공개 상세와 같은 본문(D7)
  [API_ERROR_CODES.SCHEDULE_NOT_FOUND]: '일정을 찾을 수 없습니다.',
  [API_ERROR_CODES.APPLICATION_CLOSED]: '모집이 마감되었습니다.',
  [API_ERROR_CODES.ALREADY_APPLIED]: '이미 신청한 일정입니다.',
  [API_ERROR_CODES.REAPPLY_NOT_ALLOWED]:
    '이 일정은 다시 신청할 수 없습니다. 오늘사이에 문의해 주세요.',
  [API_ERROR_CODES.PENDING_APPLICATION_LIMIT]:
    '입금 대기 중인 다른 신청이 있습니다. 그 신청이 확정되거나 취소된 뒤에 신청해 주세요. 오늘사이에 문의해 주세요.',
  [API_ERROR_CODES.BIRTH_YEAR_OUT_OF_RANGE]:
    '이 일정의 남성 연령대가 아닙니다.',
  [API_ERROR_CODES.SCHEDULE_FULL]: '자리가 모두 찼습니다.',
  [API_ERROR_CODES.APPLICATION_NOT_CANCELLABLE]:
    '신청 마감이 지나 취소할 수 없습니다. 오늘사이에 문의해 주세요.',
};

const rejectionError = ({ status, code }: Rejection) =>
  apiError(status, code, MESSAGES[code] ?? '요청을 처리할 수 없습니다.');

const applicationNotFound = () =>
  apiError(
    404,
    API_ERROR_CODES.APPLICATION_NOT_FOUND,
    '신청을 찾을 수 없습니다. 화면을 새로 고쳐 주세요.',
  );

/** 운영자 경로: 회차가 없거나 다른 상품의 회차 — SchedulesService와 같은 본문. */
const scheduleNotFound = () =>
  apiError(404, API_ERROR_CODES.SCHEDULE_NOT_FOUND, '회차를 찾을 수 없습니다.');

/** 회원 응답용 — 회차는 공개 필드만(정확한 장소 · 취소 사유 없음, 12절). */
export const MY_APPLICATION_SELECT = {
  id: true,
  scheduleId: true,
  status: true,
  cancelledBy: true,
  price: true,
  createdAt: true,
  updatedAt: true,
  schedule: {
    select: {
      startsAt: true,
      endsAt: true,
      applyDeadlineAt: true,
      venueArea: true,
      status: true,
      meetup: { select: { title: true } },
    },
  },
} as const satisfies Prisma.ApplicationSelect;

/** 운영자 응답용 — 이름 · 휴대폰은 event_db에 없다(admin이 member API로 합친다, D11). */
export const ADMIN_APPLICATION_SELECT = {
  id: true,
  scheduleId: true,
  memberId: true,
  gender: true,
  price: true,
  status: true,
  cancelledBy: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ApplicationSelect;

type MyApplicationRow = Prisma.ApplicationGetPayload<{
  select: typeof MY_APPLICATION_SELECT;
}>;
type AdminApplicationRow = Prisma.ApplicationGetPayload<{
  select: typeof ADMIN_APPLICATION_SELECT;
}>;

/** 응답 스키마가 모르는 키를 떼어 낸다 — 공개 필드 격리의 마지막 겹(SPEC-002 12절과 같은 방식). */
export function toMyApplication(row: MyApplicationRow): MyApplication {
  const { schedule } = row;
  return MyApplicationSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    schedule: {
      title: schedule.meetup.title,
      startsAt: schedule.startsAt.toISOString(),
      endsAt: schedule.endsAt.toISOString(),
      applyDeadlineAt: schedule.applyDeadlineAt.toISOString(),
      venueArea: schedule.venueArea,
      status: schedule.status,
    },
  });
}

export function toAdminApplication(row: AdminApplicationRow): AdminApplication {
  return AdminApplicationSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** 같은 회차 · 같은 회원의 두 번째 활성 신청 — 잠금을 거치지 않는 경로가 생겨도 부분 유니크 인덱스가 막는다(D3). */
function isActiveDuplicate(error: unknown): boolean {
  const { sqlState, constraint } = dbErrorFields(error);
  return sqlState === '23505' && constraint === 'Application_active_member_key';
}

export interface ApplicationsServiceOptions {
  logger?: Logger;
  now?: () => Date;
}

export class ApplicationsService {
  private readonly logger: Logger;
  private readonly now: () => Date;

  constructor(
    private readonly prisma: ApplicationsPrisma,
    private readonly members: MemberLookup,
    options: ApplicationsServiceOptions = {},
  ) {
    this.logger = options.logger ?? defaultLogger;
    this.now = options.now ?? (() => new Date());
  }

  // ----- 회원 -----

  /** D3 · D7. 위임 호출이 실패하면 트랜잭션을 열지 않는다 — 자리를 잡지 않았으므로 부분 상태가 없다. */
  async apply(
    caller: CallerUser,
    body: CreateApplicationRequest,
    requestId: string,
  ): Promise<MyApplication> {
    const applicant = await this.members.lookupSelf(caller, requestId);
    const { scheduleId } = body;

    const outcome = await busyAsServiceUnavailable(
      this.prisma
        .$transaction(async (tx) => {
          await setLockTimeout(tx);
          const locked = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "Schedule" WHERE "id" = ${scheduleId} FOR UPDATE`;
          // 회차 · now는 잠금을 얻은 뒤에 읽는다(D4) — 기다리는 동안 바뀐 상태 · 마감 · 정원으로 판정한다
          const schedule =
            locked.length === 0
              ? null
              : await tx.schedule.findUniqueOrThrow({
                  where: { id: scheduleId },
                  select: {
                    status: true,
                    priceMale: true,
                    priceFemale: true,
                    applyDeadlineAt: true,
                    capacityMale: true,
                    capacityFemale: true,
                    maleMinBirthYear: true,
                    maleMaxBirthYear: true,
                  },
                });
          const now = this.now();
          // 생성 선택자 scheduleId_memberId는 쓰지 않는다 — 같은 쌍에 CANCELLED 행이 여럿일 수 있다(9절)
          const mine = await tx.application.findMany({
            where: { scheduleId, memberId: caller.id },
            select: { status: true, cancelledBy: true },
          });
          const pendingElsewhere = await tx.application.count({
            where: {
              memberId: caller.id,
              status: 'PENDING',
              scheduleId: { not: scheduleId },
              // 시작 전 회차만 — startsAt = now면 시작한 것으로 본다(D2)
              schedule: { startsAt: { gt: now } },
            },
          });
          // 잠금 문장과 **별도 문장** — 앞 트랜잭션이 커밋한 신청을 센다(11절)
          const activeOfMyGender = await countActive(
            tx,
            scheduleId,
            applicant.gender,
          );
          const decision = decideApply({
            schedule,
            now,
            applicant,
            hasActiveHere: mine.some((row) => row.status !== 'CANCELLED'),
            adminCancelledHere: mine.some((row) => row.cancelledBy === 'ADMIN'),
            pendingElsewhere,
            activeOfMyGender,
          });
          if (decision.kind === 'reject') return decision;
          const row = await tx.application.create({
            data: {
              scheduleId,
              memberId: caller.id,
              gender: applicant.gender,
              price: decision.price,
            },
            select: MY_APPLICATION_SELECT,
          });
          return { kind: 'created' as const, row };
        })
        .catch((error: unknown) => {
          if (isActiveDuplicate(error)) {
            return {
              kind: 'reject',
              status: 409,
              code: API_ERROR_CODES.ALREADY_APPLIED,
            } satisfies Rejection;
          }
          throw error;
        }),
      this.logBusy(scheduleId, requestId),
    );

    if (outcome.kind === 'reject') {
      if (outcome.status === 409) {
        this.logger.info('application.rejected', {
          scheduleId,
          code: outcome.code,
          requestId,
        });
      }
      throw rejectionError(outcome);
    }
    this.logger.info('application.created', {
      memberId: caller.id,
      scheduleId,
      applicationId: outcome.row.id,
      requestId,
    });
    return toMyApplication(outcome.row);
  }

  /** 이 회원의 신청 전부(모든 상태). 최근 신청부터. */
  async listMine(
    caller: CallerUser,
    query: MyApplicationListQuery,
  ): Promise<MyApplicationListResponse> {
    const where: Prisma.ApplicationWhereInput = {
      memberId: caller.id,
      scheduleId: query.scheduleId,
    };
    const [rows, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        select: MY_APPLICATION_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.application.count({ where }),
    ]);
    return {
      items: rows.map(toMyApplication),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 본인 취소 — 신청 마감 전까지(C). 남의 신청 · 없는 신청은 같은 404다(존재를 드러내지 않는다). */
  async cancelMine(
    caller: CallerUser,
    applicationId: string,
    requestId: string,
  ): Promise<MyApplication> {
    const { row, changed } = await busyAsServiceUnavailable(
      this.prisma.$transaction(async (tx) => {
        await setLockTimeout(tx);
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Application"
          WHERE "id" = ${applicationId} AND "memberId" = ${caller.id} FOR UPDATE`;
        if (locked.length === 0) throw applicationNotFound();
        const current = await tx.application.findUniqueOrThrow({
          where: { id: applicationId },
          select: MY_APPLICATION_SELECT,
        });
        const decision = decideCancel(current.status, {
          applyDeadlineAt: current.schedule.applyDeadlineAt,
          now: this.now(),
        });
        if (decision.kind === 'reject') throw rejectionError(decision);
        if (decision.kind === 'noop') return { row: current, changed: false };
        const row = await tx.application.update({
          where: { id: applicationId },
          data: { status: 'CANCELLED', cancelledBy: 'MEMBER' },
          select: MY_APPLICATION_SELECT,
        });
        return { row, changed: true };
      }),
      this.logBusy(undefined, requestId),
    );
    if (changed) {
      this.logger.info('application.cancelled', {
        applicationId,
        scheduleId: row.scheduleId,
        by: 'MEMBER',
        memberId: caller.id,
        requestId,
      });
    }
    return toMyApplication(row);
  }

  // ----- 운영자 -----

  /** 신청 순. `scheduleId`가 `meetupId`에 속하지 않으면 404. 접속기록 `application.list_viewed`. */
  async listForSchedule(
    admin: CallerUser,
    meetupId: string,
    scheduleId: string,
    query: AdminApplicationListQuery,
    requestId: string,
  ): Promise<AdminApplicationListResponse> {
    await this.assertScheduleOfMeetup(meetupId, scheduleId);
    const where: Prisma.ApplicationWhereInput = {
      scheduleId,
      status: query.status,
    };
    const [rows, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        select: ADMIN_APPLICATION_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.application.count({ where }),
    ]);
    this.logger.info('application.list_viewed', {
      adminId: admin.id,
      scheduleId,
      count: rows.length,
      requestId,
    });
    return {
      items: rows.map(toAdminApplication),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 운영자 취소 — 언제든, 사유 없음(J). 경로의 상품 · 회차 · 신청이 서로 맞아야 한다. */
  async cancelByAdmin(
    admin: CallerUser,
    meetupId: string,
    scheduleId: string,
    applicationId: string,
    requestId: string,
  ): Promise<AdminApplication> {
    await this.assertScheduleOfMeetup(meetupId, scheduleId);
    const { row, changed } = await busyAsServiceUnavailable(
      this.prisma.$transaction(async (tx) => {
        await setLockTimeout(tx);
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Application"
          WHERE "id" = ${applicationId} AND "scheduleId" = ${scheduleId} FOR UPDATE`;
        if (locked.length === 0) throw applicationNotFound();
        const current = await tx.application.findUniqueOrThrow({
          where: { id: applicationId },
          select: ADMIN_APPLICATION_SELECT,
        });
        // 운영자 취소에는 시각 조건이 없다
        if (decideCancel(current.status, null).kind === 'noop') {
          return { row: current, changed: false };
        }
        const row = await tx.application.update({
          where: { id: applicationId },
          data: { status: 'CANCELLED', cancelledBy: 'ADMIN' },
          select: ADMIN_APPLICATION_SELECT,
        });
        return { row, changed: true };
      }),
      this.logBusy(scheduleId, requestId),
    );
    if (changed) {
      this.logger.info('application.cancelled', {
        applicationId,
        scheduleId,
        by: 'ADMIN',
        adminId: admin.id,
        requestId,
      });
    }
    return toAdminApplication(row);
  }

  /** 회차는 상품을 옮기지 않으므로 잠그지 않고 확인한다. */
  private async assertScheduleOfMeetup(
    meetupId: string,
    scheduleId: string,
  ): Promise<void> {
    const schedule = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, meetupId },
      select: { id: true },
    });
    if (schedule === null) throw scheduleNotFound();
  }

  /** 503으로 끝난 신청 · 취소의 원인(SPEC-003 14절 `application.busy`). */
  private logBusy(
    scheduleId: string | undefined,
    requestId: string,
  ): (cause: BusyCause) => void {
    return (cause) =>
      this.logger.warn('application.busy', {
        ...(scheduleId !== undefined && { scheduleId }),
        cause,
        requestId,
      });
  }
}
