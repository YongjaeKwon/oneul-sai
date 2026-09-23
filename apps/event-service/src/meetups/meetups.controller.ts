import {
  Body,
  Controller,
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
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateMeetupRequestSchema,
  MeetupIdSchema,
  MeetupListQuerySchema,
  UpdateMeetupRequestSchema,
  type CreateMeetupRequest,
  type Meetup,
  type MeetupListQuery,
  type MeetupListResponse,
  type UpdateMeetupRequest,
} from '@oneul-sai/contracts';
import {
  CurrentUser,
  JsonContentTypeGuard,
  RequestId,
  Roles,
  ZodValidationPipe,
  type CallerUser,
} from '@oneul-sai/service-kit';
import { API_HEADERS } from '../common/swagger.js';
import { NoStoreInterceptor } from '../common/no-store.interceptor.js';
import { MeetupsService } from './meetups.service.js';

// 운영자 경로 — `/api/v1/meetups/**`는 전부 ADMIN(클래스 수준, SPEC-002 D9) + Cache-Control: no-store.
@ApiTags('meetups')
@ApiHeader(API_HEADERS.internalToken)
@ApiHeader(API_HEADERS.userId)
@ApiHeader(API_HEADERS.userRole)
@Roles('ADMIN')
@UseInterceptors(NoStoreInterceptor)
@Controller('api/v1/meetups')
export class MeetupsController {
  constructor(private readonly meetups: MeetupsService) {}

  @Get()
  @ApiOperation({ summary: '운영자: 모임 상품 목록 (createdAt 내림차순)' })
  @ApiQuery({ name: 'page', required: false, description: '1~1000, 기본 1' })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    description: '1~100, 기본 20',
  })
  @ApiOkResponse({
    description:
      'MeetupListResponse — { items: Meetup[], total, page, pageSize }',
  })
  list(
    @Query(new ZodValidationPipe(MeetupListQuerySchema)) query: MeetupListQuery,
  ): Promise<MeetupListResponse> {
    return this.meetups.list(query);
  }

  @Post()
  @UseGuards(JsonContentTypeGuard)
  @HttpCode(201)
  @ApiOperation({ summary: '운영자: 모임 상품 등록' })
  @ApiBody({
    description:
      'CreateMeetupRequest (@oneul-sai/contracts) — { title, description? }',
    schema: { type: 'object' },
  })
  @ApiCreatedResponse({ description: 'Meetup' })
  create(
    @CurrentUser() admin: CallerUser,
    @Body(new ZodValidationPipe(CreateMeetupRequestSchema))
    body: CreateMeetupRequest,
    @RequestId() requestId: string,
  ): Promise<Meetup> {
    return this.meetups.create(admin, body, requestId);
  }

  @Get(':meetupId')
  @ApiOperation({ summary: '운영자: 모임 상품 상세' })
  @ApiParam({ name: 'meetupId', description: '모임 상품 ID (UUID)' })
  @ApiOkResponse({ description: 'Meetup' })
  @ApiNotFoundResponse({ description: 'MEETUP_NOT_FOUND' })
  get(
    @Param('meetupId', new ZodValidationPipe(MeetupIdSchema)) meetupId: string,
  ): Promise<Meetup> {
    return this.meetups.get(meetupId);
  }

  @Patch(':meetupId')
  @UseGuards(JsonContentTypeGuard)
  @ApiOperation({
    summary:
      '운영자: 모임 상품 수정 — 고친 제목 · 설명은 그 상품의 모든 회차 응답에 반영된다',
  })
  @ApiParam({ name: 'meetupId', description: '모임 상품 ID (UUID)' })
  @ApiBody({
    description:
      'UpdateMeetupRequest (@oneul-sai/contracts) — { title?, description? }, 최소 한 필드',
    schema: { type: 'object' },
  })
  @ApiOkResponse({ description: 'Meetup' })
  @ApiNotFoundResponse({ description: 'MEETUP_NOT_FOUND' })
  update(
    @CurrentUser() admin: CallerUser,
    @Param('meetupId', new ZodValidationPipe(MeetupIdSchema)) meetupId: string,
    @Body(new ZodValidationPipe(UpdateMeetupRequestSchema))
    body: UpdateMeetupRequest,
    @RequestId() requestId: string,
  ): Promise<Meetup> {
    return this.meetups.update(admin, meetupId, body, requestId);
  }
}
