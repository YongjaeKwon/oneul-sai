import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminApplicationListQuerySchema,
  AdminUpdateApplicationStatusRequestSchema,
  ApplicationIdSchema,
  MeetupIdSchema,
  ScheduleIdSchema,
  type AdminApplication,
  type AdminApplicationListQuery,
  type AdminApplicationListResponse,
  type AdminUpdateApplicationStatusRequest,
} from '@oneul-sai/contracts';
import {
  CurrentUser,
  JsonContentTypeGuard,
  RequestId,
  Roles,
  ZodValidationPipe,
  type CallerUser,
} from '@oneul-sai/service-kit';
import { NoStoreInterceptor } from '../common/no-store.interceptor.js';
import { API_HEADERS } from '../common/swagger.js';
import { ApplicationsService } from './applications.service.js';

const meetupIdPipe = new ZodValidationPipe(MeetupIdSchema);
const scheduleIdPipe = new ZodValidationPipe(ScheduleIdSchema);

// 운영자 신청 관리 — 기존 규칙 "/meetups/**는 전부 ADMIN"에 중첩한다(D6). 클래스 수준 ADMIN + no-store.
// PATCH 하나가 두 동작을 받는다: PENDING = 참가 가능 안내(D16), CANCELLED = 취소.
@ApiTags('admin-applications')
@ApiHeader(API_HEADERS.internalToken)
@ApiHeader(API_HEADERS.userId)
@ApiHeader(API_HEADERS.userRole)
@ApiParam({ name: 'meetupId', description: '모임 상품 ID (UUID)' })
@ApiParam({ name: 'scheduleId', description: '회차 ID (UUID)' })
@Roles('ADMIN')
@UseInterceptors(NoStoreInterceptor)
@Controller('api/v1/meetups/:meetupId/schedules/:scheduleId/applications')
export class AdminApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  @ApiOperation({
    summary: '운영자: 회차의 신청 목록 — 신청 순(접속기록 로그)',
    description:
      '이름 · 휴대폰은 없다 — memberId로 member-service GET /api/v1/members?ids=를 불러 합친다(SPEC-003 D11).',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'APPLIED · PENDING · CONFIRMED · CANCELLED',
  })
  @ApiQuery({ name: 'page', required: false, description: '1~1000, 기본 1' })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    description: '1~100, 기본 100',
  })
  @ApiOkResponse({ description: 'AdminApplicationListResponse' })
  @ApiNotFoundResponse({
    description:
      'SCHEDULE_NOT_FOUND (없음 또는 scheduleId가 meetupId에 속하지 않음)',
  })
  list(
    @CurrentUser() admin: CallerUser,
    @Param('meetupId', meetupIdPipe) meetupId: string,
    @Param('scheduleId', scheduleIdPipe) scheduleId: string,
    @Query(new ZodValidationPipe(AdminApplicationListQuerySchema))
    query: AdminApplicationListQuery,
    @RequestId() requestId: string,
  ): Promise<AdminApplicationListResponse> {
    return this.applications.listForSchedule(
      admin,
      meetupId,
      scheduleId,
      query,
      requestId,
    );
  }

  @Patch(':applicationId/status')
  @UseGuards(JsonContentTypeGuard)
  @ApiOperation({
    summary:
      '운영자: 참가 가능 안내(PENDING — 접수 → 입금 대기, 자리를 잡는다) 또는 취소(CANCELLED — 언제든, 사유 없음). 같은 상태는 no-op 200',
    description:
      '참가 가능 안내는 회차 행 → 신청 행을 잠근 뒤 그 성별의 자리 잡은 수 < 정원일 때만 된다(SPEC-003 D16). 회차 상태 · 시각 조건은 없다. 취소는 접수 · 입금 대기 · 참가 확정 모두 된다.',
  })
  @ApiParam({ name: 'applicationId', description: '신청 ID (UUID)' })
  @ApiBody({
    description:
      "AdminUpdateApplicationStatusRequest — { status: 'PENDING' | 'CANCELLED' }",
    schema: { type: 'object' },
  })
  @ApiOkResponse({
    description:
      'AdminApplication (status PENDING — 안내됨 / CANCELLED · cancelledBy ADMIN — 취소됨)',
  })
  @ApiNotFoundResponse({
    description:
      'SCHEDULE_NOT_FOUND (회차가 상품에 속하지 않음) · APPLICATION_NOT_FOUND (그 회차의 신청이 아님)',
  })
  @ApiConflictResponse({
    description:
      '참가 가능 안내만: SCHEDULE_FULL (그 성별의 자리 잡은 수 ≥ 정원) · INVALID_STATUS_TRANSITION (CONFIRMED · CANCELLED 신청)',
  })
  @ApiServiceUnavailableResponse({
    description: 'SERVICE_BUSY — 잠금 대기 2초 초과(Retry-After: 1)',
  })
  updateStatus(
    @CurrentUser() admin: CallerUser,
    @Param('meetupId', meetupIdPipe) meetupId: string,
    @Param('scheduleId', scheduleIdPipe) scheduleId: string,
    @Param('applicationId', new ZodValidationPipe(ApplicationIdSchema))
    applicationId: string,
    @Body(new ZodValidationPipe(AdminUpdateApplicationStatusRequestSchema))
    body: AdminUpdateApplicationStatusRequest,
    @RequestId() requestId: string,
  ): Promise<AdminApplication> {
    return body.status === 'PENDING'
      ? this.applications.inviteByAdmin(
          admin,
          meetupId,
          scheduleId,
          applicationId,
          requestId,
        )
      : this.applications.cancelByAdmin(
          admin,
          meetupId,
          scheduleId,
          applicationId,
          requestId,
        );
  }
}
