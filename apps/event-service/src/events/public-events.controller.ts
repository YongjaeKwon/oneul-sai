import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  PublicScheduleListQuerySchema,
  ScheduleIdSchema,
  type PublicSchedule,
  type PublicScheduleListQuery,
  type PublicScheduleListResponse,
} from '@oneul-sai/contracts';
import { Public, ZodValidationPipe } from '@oneul-sai/service-kit';
import { API_HEADERS } from '../common/swagger.js';
import { PublicEventsService } from './public-events.service.js';

// 참가자 공개 경로 — 읽기 전용, `@Public()` 두 핸들러뿐 (SPEC-002 D9). 경로 "events"는 참가자에게 보이는 회차(일정)다.
@ApiTags('events')
@ApiHeader(API_HEADERS.internalToken)
@Controller('api/v1/events')
export class PublicEventsController {
  constructor(private readonly events: PublicEventsService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary:
      '공개 일정 목록 — OPEN · CLOSED이고 시작 전, startsAt · id 오름차순',
    description:
      '공개 필드만(PublicSchedule). 장소는 지역(venueArea)만 있다. 호출자 역할과 무관하게 같은 응답이다.',
  })
  @ApiQuery({ name: 'page', required: false, description: '1~1000, 기본 1' })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    description: '1~50, 기본 20',
  })
  @ApiOkResponse({
    description:
      'PublicScheduleListResponse — { items: PublicSchedule[], total, page, pageSize }. 성별 자리 마감은 maleFull · femaleFull(숫자 없음, SPEC-003)',
  })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED' })
  list(
    @Query(new ZodValidationPipe(PublicScheduleListQuerySchema))
    query: PublicScheduleListQuery,
  ): Promise<PublicScheduleListResponse> {
    return this.events.list(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({
    summary: '공개 일정 상세 — OPEN · CLOSED만',
    description:
      'DRAFT · CANCELLED · 없음은 모두 같은 본문의 404 SCHEDULE_NOT_FOUND(requestId · timestamp · path만 다르다).',
  })
  @ApiParam({ name: 'id', description: '회차 ID (UUID)' })
  @ApiOkResponse({
    description: 'PublicSchedule(+ maleFull · femaleFull, SPEC-003)',
  })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED (UUID 아님)' })
  @ApiNotFoundResponse({ description: 'SCHEDULE_NOT_FOUND' })
  detail(
    @Param('id', new ZodValidationPipe(ScheduleIdSchema)) id: string,
  ): Promise<PublicSchedule> {
    return this.events.detail(id);
  }
}
