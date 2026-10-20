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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ApplicationIdSchema,
  CreateApplicationRequestSchema,
  MyApplicationListQuerySchema,
  UpdateApplicationStatusRequestSchema,
  type CreateApplicationRequest,
  type MyApplication,
  type MyApplicationListQuery,
  type MyApplicationListResponse,
  type UpdateApplicationStatusRequest,
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

// 참가자 신청 경로 — 클래스 수준 MEMBER(ADMIN은 403, D6) + Cache-Control: no-store(보호 데이터, 7절).
@ApiTags('applications')
@ApiHeader(API_HEADERS.internalToken)
@ApiHeader(API_HEADERS.userId)
@ApiHeader({ ...API_HEADERS.userRole, description: 'MEMBER' })
@Roles('MEMBER')
@UseInterceptors(NoStoreInterceptor)
@Controller('api/v1/applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  @UseGuards(JsonContentTypeGuard)
  @HttpCode(201)
  @ApiOperation({
    summary:
      '참가 신청 — 접수(APPLIED). 자리는 운영자의 참가 가능 안내 때 잡힌다',
    description:
      'member-service에 본인 성별 · 계정 상태를 묻고(ADR-011) 회차 행을 잠근 뒤 판정한다(SPEC-003 D3 · D15). 정원 · 연령은 보지 않는다.',
  })
  @ApiBody({
    description:
      'CreateApplicationRequest (@oneul-sai/contracts) — { scheduleId }만. 성별 · 참가비는 받지 않는다',
    schema: { type: 'object' },
  })
  @ApiCreatedResponse({ description: 'MyApplication (status APPLIED)' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED (탈퇴)' })
  @ApiForbiddenResponse({
    description: 'ACCOUNT_SUSPENDED (정지) · FORBIDDEN (운영자)',
  })
  @ApiNotFoundResponse({
    description: 'SCHEDULE_NOT_FOUND (없음 · DRAFT · CANCELLED, 같은 본문)',
  })
  @ApiConflictResponse({
    description:
      'APPLICATION_CLOSED · ALREADY_APPLIED · REAPPLY_NOT_ALLOWED · PENDING_APPLICATION_LIMIT (D15 순서의 첫 코드)',
  })
  @ApiServiceUnavailableResponse({
    description:
      'SERVICE_BUSY — 회원 조회 실패 · 잠금 대기 2초 초과 · 연결 대기(Retry-After: 1)',
  })
  apply(
    @CurrentUser() caller: CallerUser,
    @Body(new ZodValidationPipe(CreateApplicationRequestSchema))
    body: CreateApplicationRequest,
    @RequestId() requestId: string,
  ): Promise<MyApplication> {
    return this.applications.apply(caller, body, requestId);
  }

  @Get()
  @ApiOperation({ summary: '내 신청 — 모든 상태, 최근 신청부터' })
  @ApiQuery({ name: 'scheduleId', required: false })
  @ApiQuery({ name: 'page', required: false, description: '1~1000, 기본 1' })
  @ApiQuery({ name: 'pageSize', required: false, description: '1~50, 기본 20' })
  @ApiOkResponse({
    description:
      'MyApplicationListResponse — 회차는 공개 필드만(정확한 장소 없음)',
  })
  listMine(
    @CurrentUser() caller: CallerUser,
    @Query(new ZodValidationPipe(MyApplicationListQuerySchema))
    query: MyApplicationListQuery,
  ): Promise<MyApplicationListResponse> {
    return this.applications.listMine(caller, query);
  }

  @Patch(':applicationId/status')
  @UseGuards(JsonContentTypeGuard)
  @ApiOperation({
    summary:
      '본인 취소 — 접수는 언제든, 입금 대기는 신청 마감 전까지(회차가 CLOSED여도), 참가 확정은 불가. 같은 상태는 no-op 200',
  })
  @ApiParam({ name: 'applicationId', description: '신청 ID (UUID)' })
  @ApiBody({
    description: "UpdateApplicationStatusRequest — { status: 'CANCELLED' }",
    schema: { type: 'object' },
  })
  @ApiOkResponse({ description: 'MyApplication (cancelledBy MEMBER)' })
  @ApiNotFoundResponse({
    description: 'APPLICATION_NOT_FOUND (없음 · 남의 신청, 같은 본문)',
  })
  @ApiConflictResponse({
    description:
      'APPLICATION_NOT_CANCELLABLE (입금 대기 · 신청 마감 뒤) · APPLICATION_CONFIRMED (참가 확정, SPEC-004)',
  })
  @ApiServiceUnavailableResponse({
    description: 'SERVICE_BUSY — 잠금 대기 2초 초과(Retry-After: 1)',
  })
  cancelMine(
    @CurrentUser() caller: CallerUser,
    @Param('applicationId', new ZodValidationPipe(ApplicationIdSchema))
    applicationId: string,
    @Body(new ZodValidationPipe(UpdateApplicationStatusRequestSchema))
    _body: UpdateApplicationStatusRequest,
    @RequestId() requestId: string,
  ): Promise<MyApplication> {
    return this.applications.cancelMine(caller, applicationId, requestId);
  }
}
