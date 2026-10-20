import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminScheduleListQuerySchema,
  BatchCreateSchedulesRequestSchema,
  CreateScheduleRequestSchema,
  MeetupIdSchema,
  ScheduleIdSchema,
  UpdateScheduleRequestSchema,
  UpdateScheduleStatusRequestSchema,
  type AdminSchedule,
  type AdminScheduleListQuery,
  type AdminScheduleListResponse,
  type BatchCreateSchedulesRequest,
  type BatchCreateSchedulesResponse,
  type CreateScheduleRequest,
  type UpdateScheduleRequest,
  type UpdateScheduleStatusRequest,
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
import { SchedulesService } from './schedules.service.js';

const meetupIdPipe = new ZodValidationPipe(MeetupIdSchema);
const scheduleIdPipe = new ZodValidationPipe(ScheduleIdSchema);

// 운영자 회차 경로 — 클래스 수준 ADMIN + Cache-Control: no-store (SPEC-002 D9). 응답은 운영자 스키마(AdminSchedule).
// `POST batch`는 `:scheduleId`와 같은 깊이지만 그 깊이의 POST는 이것뿐이다(`GET .../batch`는 UUID가 아니라 400).
@ApiTags('schedules')
@ApiHeader(API_HEADERS.internalToken)
@ApiHeader(API_HEADERS.userId)
@ApiHeader(API_HEADERS.userRole)
@ApiParam({ name: 'meetupId', description: '모임 상품 ID (UUID)' })
@Roles('ADMIN')
@UseInterceptors(NoStoreInterceptor)
@Controller('api/v1/meetups/:meetupId/schedules')
export class AdminSchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  @ApiOperation({
    summary: '운영자: 회차 목록 — 모든 상태, startsAt이 [from, to)',
  })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO 8601 + offset' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO 8601 + offset' })
  @ApiQuery({ name: 'page', required: false, description: '1~1000, 기본 1' })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    description: '1~100, 기본 20',
  })
  @ApiOkResponse({
    description:
      'AdminScheduleListResponse — { items: AdminSchedule[], total, page, pageSize }',
  })
  @ApiNotFoundResponse({ description: 'MEETUP_NOT_FOUND' })
  list(
    @Param('meetupId', meetupIdPipe) meetupId: string,
    @Query(new ZodValidationPipe(AdminScheduleListQuerySchema))
    query: AdminScheduleListQuery,
  ): Promise<AdminScheduleListResponse> {
    return this.schedules.list(meetupId, query);
  }

  @Post()
  @UseGuards(JsonContentTypeGuard)
  @HttpCode(201)
  @ApiOperation({ summary: '운영자: 회차 생성 (항상 DRAFT)' })
  @ApiBody({
    description:
      'CreateScheduleRequest (@oneul-sai/contracts). 시각 · 순서 규칙 위반 400 SCHEDULE_TIME_INVALID, 남성 연령대 min > max 400 BIRTH_YEAR_RANGE_INVALID',
    schema: { type: 'object' },
  })
  @ApiCreatedResponse({ description: 'AdminSchedule' })
  @ApiNotFoundResponse({ description: 'MEETUP_NOT_FOUND' })
  create(
    @CurrentUser() admin: CallerUser,
    @Param('meetupId', meetupIdPipe) meetupId: string,
    @Body(new ZodValidationPipe(CreateScheduleRequestSchema))
    body: CreateScheduleRequest,
    @RequestId() requestId: string,
  ): Promise<AdminSchedule> {
    return this.schedules.create(admin, meetupId, body, requestId);
  }

  @Post('batch')
  @UseGuards(JsonContentTypeGuard)
  @HttpCode(201)
  @ApiOperation({
    summary:
      '운영자: 여러 회차 등록 (1~12개, 전부 DRAFT, 전부 또는 없음 — SPEC-002 D15)',
    description:
      '400이면 행이 하나도 생기지 않는다. 문제 항목은 message의 items.<순번>(0부터)으로 알린다.',
  })
  @ApiBody({
    description:
      'BatchCreateSchedulesRequest (@oneul-sai/contracts) — { items: CreateScheduleRequest[] }',
    schema: { type: 'object' },
  })
  @ApiCreatedResponse({
    description:
      'BatchCreateSchedulesResponse — { items: AdminSchedule[] } (요청 순서)',
  })
  @ApiNotFoundResponse({ description: 'MEETUP_NOT_FOUND' })
  @ApiServiceUnavailableResponse({
    description:
      'SERVICE_BUSY — 트랜잭션 연결 대기 · 제한 시간 초과(P2028, Retry-After: 1). 아무것도 만들어지지 않는다',
  })
  createBatch(
    @CurrentUser() admin: CallerUser,
    @Param('meetupId', meetupIdPipe) meetupId: string,
    @Body(new ZodValidationPipe(BatchCreateSchedulesRequestSchema))
    body: BatchCreateSchedulesRequest,
    @RequestId() requestId: string,
  ): Promise<BatchCreateSchedulesResponse> {
    return this.schedules.createBatch(admin, meetupId, body, requestId);
  }

  @Get(':scheduleId')
  @ApiOperation({ summary: '운영자: 회차 상세 (장소 안내 포함)' })
  @ApiParam({ name: 'scheduleId', description: '회차 ID (UUID)' })
  @ApiOkResponse({ description: 'AdminSchedule' })
  @ApiNotFoundResponse({
    description: 'SCHEDULE_NOT_FOUND (없거나 다른 상품의 회차)',
  })
  get(
    @Param('meetupId', meetupIdPipe) meetupId: string,
    @Param('scheduleId', scheduleIdPipe) scheduleId: string,
  ): Promise<AdminSchedule> {
    return this.schedules.get(meetupId, scheduleId);
  }

  @Patch(':scheduleId')
  @UseGuards(JsonContentTypeGuard)
  @ApiOperation({
    summary: '운영자: 회차 수정 — 보낸 필드만, 저장된 값과 병합해 규칙 판정',
  })
  @ApiParam({ name: 'scheduleId', description: '회차 ID (UUID)' })
  @ApiBody({
    description:
      'UpdateScheduleRequest (@oneul-sai/contracts). 선택 필드는 null로 비운다',
    schema: { type: 'object' },
  })
  @ApiOkResponse({
    description:
      'AdminSchedule(+ appliedMale · appliedFemale(자리 잡은 수) · receivedMale · receivedFemale(접수 수) · maleFull · femaleFull)',
  })
  @ApiNotFoundResponse({ description: 'SCHEDULE_NOT_FOUND' })
  @ApiConflictResponse({
    description:
      'SCHEDULE_NOT_EDITABLE (CANCELLED) · CAPACITY_BELOW_APPLICATIONS (정원 < 그 성별 자리 잡은 신청 수 — 접수는 세지 않는다, SPEC-003)',
  })
  @ApiServiceUnavailableResponse({
    description: 'SERVICE_BUSY — 회차 잠금 대기 2초 초과(Retry-After: 1)',
  })
  update(
    @CurrentUser() admin: CallerUser,
    @Param('meetupId', meetupIdPipe) meetupId: string,
    @Param('scheduleId', scheduleIdPipe) scheduleId: string,
    @Body(new ZodValidationPipe(UpdateScheduleRequestSchema))
    body: UpdateScheduleRequest,
    @RequestId() requestId: string,
  ): Promise<AdminSchedule> {
    return this.schedules.update(admin, meetupId, scheduleId, body, requestId);
  }

  @Patch(':scheduleId/status')
  @UseGuards(JsonContentTypeGuard)
  @ApiOperation({
    summary: '운영자: 회차 상태 변경 — 공개 · 모집 마감 · 다시 열기 · 취소',
    description: 'SPEC-002 6절 전이 표. 같은 상태는 no-op 200.',
  })
  @ApiParam({ name: 'scheduleId', description: '회차 ID (UUID)' })
  @ApiBody({
    description:
      "UpdateScheduleStatusRequest (@oneul-sai/contracts) — { status: 'OPEN' | 'CLOSED' | 'CANCELLED', cancelReason? }",
    schema: { type: 'object' },
  })
  @ApiOkResponse({
    description:
      'AdminSchedule. → CANCELLED면 같은 트랜잭션에서 그 회차의 활성 신청(접수 · 입금 대기 · 참가 확정)이 모두 취소된다(cancelledBy SCHEDULE, SPEC-003)',
  })
  @ApiNotFoundResponse({ description: 'SCHEDULE_NOT_FOUND' })
  @ApiConflictResponse({ description: 'INVALID_STATUS_TRANSITION' })
  @ApiServiceUnavailableResponse({
    description:
      'SERVICE_BUSY — 회차 · 신청 잠금 대기 2초 초과(Retry-After: 1)',
  })
  updateStatus(
    @CurrentUser() admin: CallerUser,
    @Param('meetupId', meetupIdPipe) meetupId: string,
    @Param('scheduleId', scheduleIdPipe) scheduleId: string,
    @Body(new ZodValidationPipe(UpdateScheduleStatusRequestSchema))
    body: UpdateScheduleStatusRequest,
    @RequestId() requestId: string,
  ): Promise<AdminSchedule> {
    return this.schedules.updateStatus(
      admin,
      meetupId,
      scheduleId,
      body,
      requestId,
    );
  }

  @Delete(':scheduleId')
  @HttpCode(204)
  @ApiOperation({ summary: '운영자: 회차 삭제 (DRAFT만)' })
  @ApiParam({ name: 'scheduleId', description: '회차 ID (UUID)' })
  @ApiNoContentResponse({ description: '삭제됨' })
  @ApiNotFoundResponse({ description: 'SCHEDULE_NOT_FOUND' })
  @ApiConflictResponse({ description: 'SCHEDULE_NOT_EDITABLE (DRAFT 아님)' })
  @ApiServiceUnavailableResponse({
    description: 'SERVICE_BUSY — 회차 잠금 대기 2초 초과(Retry-After: 1)',
  })
  remove(
    @CurrentUser() admin: CallerUser,
    @Param('meetupId', meetupIdPipe) meetupId: string,
    @Param('scheduleId', scheduleIdPipe) scheduleId: string,
    @RequestId() requestId: string,
  ): Promise<void> {
    return this.schedules.remove(admin, meetupId, scheduleId, requestId);
  }
}
