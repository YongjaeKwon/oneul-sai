import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  HEADER_INTERNAL_TOKEN,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
  MemberIdSchema,
  MemberListQuerySchema,
  SignupRequestSchema,
  UpdateMemberStatusRequestSchema,
  UpdateMyProfileRequestSchema,
  WithdrawRequestSchema,
  type MemberDetail,
  type MemberListQuery,
  type MemberListResponse,
  type MemberProfile,
  type SignupRequest,
  type UpdateMemberStatusRequest,
  type UpdateMyProfileRequest,
  type WithdrawRequest,
} from '@oneul-sai/contracts';
import {
  CurrentUser,
  JsonContentTypeGuard,
  Public,
  RequestId,
  Roles,
  ZodValidationPipe,
  type CallerUser,
} from '@oneul-sai/service-kit';
import type { Response } from 'express';
import {
  clearRefreshCookie,
  COOKIE_ENV,
  type CookieEnv,
} from '../common/cookies.js';
import { MembersService } from './members.service.js';

const USER_HEADERS = {
  id: {
    name: HEADER_USER_ID,
    required: true,
    description: 'Gateway가 채운 회원 ID',
  },
  role: {
    name: HEADER_USER_ROLE,
    required: true,
    description: 'MEMBER | ADMIN',
  },
};

// `/members/me`를 `/members/:id`보다 먼저 선언한다 (7절 라우팅 순서).
@ApiTags('members')
@ApiHeader({
  name: HEADER_INTERNAL_TOKEN,
  required: true,
  description: 'Gateway ↔ 서비스 공유 비밀 (env INTERNAL_API_TOKEN)',
})
@Controller('api/v1/members')
export class MembersController {
  constructor(
    private readonly members: MembersService,
    @Inject(COOKIE_ENV) private readonly cookieEnv: CookieEnv,
  ) {}

  @Post()
  @Public()
  @UseGuards(JsonContentTypeGuard)
  @HttpCode(201)
  @ApiOperation({
    summary: '가입 (SPEC-001 7절 SignupRequest)',
    description:
      '이메일 · 비밀번호 · 실명 · 성별 · 출생연도(만 19세 이상) · 휴대폰 · 동의 2개. role은 받지 않는다. 같은 이메일 → 409.',
  })
  @ApiBody({
    description: 'SignupRequest (@oneul-sai/contracts)',
    schema: { type: 'object' },
  })
  @ApiCreatedResponse({ description: 'MemberProfile' })
  signup(
    @Body(new ZodValidationPipe(SignupRequestSchema)) body: SignupRequest,
  ): Promise<MemberProfile> {
    return this.members.signup(body);
  }

  @Get('me')
  @ApiOperation({ summary: '내 프로필' })
  @ApiHeader(USER_HEADERS.id)
  @ApiHeader(USER_HEADERS.role)
  @ApiOkResponse({ description: 'MemberProfile' })
  me(@CurrentUser() user: CallerUser): Promise<MemberProfile> {
    return this.members.me(user);
  }

  @Patch('me')
  @UseGuards(JsonContentTypeGuard)
  @ApiOperation({
    summary:
      '내 프로필 수정 — 휴대폰(현재 비밀번호 필수, D9) · 마케팅 수신 동의',
  })
  @ApiHeader(USER_HEADERS.id)
  @ApiHeader(USER_HEADERS.role)
  @ApiBody({
    description:
      'UpdateMyProfileRequest — { phone?, marketingConsent?, currentPassword? }',
    schema: { type: 'object' },
  })
  @ApiOkResponse({ description: 'MemberProfile' })
  updateMe(
    @CurrentUser() user: CallerUser,
    @Body(new ZodValidationPipe(UpdateMyProfileRequestSchema))
    body: UpdateMyProfileRequest,
    @RequestId() requestId: string,
  ): Promise<MemberProfile> {
    return this.members.updateMyProfile(user, body, requestId);
  }

  @Delete('me')
  @UseGuards(JsonContentTypeGuard)
  @HttpCode(204)
  @ApiOperation({
    summary: '탈퇴 — 비밀번호 재확인 후 즉시 익명화 (D10)',
  })
  @ApiHeader(USER_HEADERS.id)
  @ApiHeader(USER_HEADERS.role)
  @ApiBody({
    description: 'WithdrawRequest — { password }',
    schema: { type: 'object' },
  })
  @ApiNoContentResponse({
    description: 'onulsai_rt_web · onulsai_rt_admin 둘 다 삭제',
  })
  async withdraw(
    @CurrentUser() user: CallerUser,
    @Body(new ZodValidationPipe(WithdrawRequestSchema)) body: WithdrawRequest,
    @RequestId() requestId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.members.withdraw(user, body, requestId);
    // Path=/api/v1/members라 요청에 쿠키가 실리지 않으므로 두 이름 모두 지운다 (7절).
    clearRefreshCookie(res, 'WEB', this.cookieEnv);
    clearRefreshCookie(res, 'ADMIN', this.cookieEnv);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: '운영자: 회원 목록 (접속기록 로그)' })
  @ApiHeader(USER_HEADERS.id)
  @ApiHeader(USER_HEADERS.role)
  @ApiQuery({ name: 'query', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({
    description: '{ items: MemberSummary[], total, page, pageSize }',
  })
  list(
    @CurrentUser() admin: CallerUser,
    @Query(new ZodValidationPipe(MemberListQuerySchema)) query: MemberListQuery,
    @RequestId() requestId: string,
  ): Promise<MemberListResponse> {
    return this.members.list(admin, query, requestId);
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: '운영자: 회원 상세 (접속기록 로그)' })
  @ApiHeader(USER_HEADERS.id)
  @ApiHeader(USER_HEADERS.role)
  @ApiParam({ name: 'id', description: '회원 ID (UUID)' })
  @ApiOkResponse({ description: 'MemberDetail' })
  detail(
    @CurrentUser() admin: CallerUser,
    @Param('id', new ZodValidationPipe(MemberIdSchema)) id: string,
    @RequestId() requestId: string,
  ): Promise<MemberDetail> {
    return this.members.detail(admin, id, requestId);
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  @UseGuards(JsonContentTypeGuard)
  @ApiOperation({
    summary:
      '운영자: 계정 상태 변경 (ACTIVE ↔ SUSPENDED). 정지 시 세션 전부 폐기',
  })
  @ApiHeader(USER_HEADERS.id)
  @ApiHeader(USER_HEADERS.role)
  @ApiParam({ name: 'id', description: '회원 ID (UUID)' })
  @ApiBody({
    description: 'UpdateMemberStatusRequest — { status, reason? }',
    schema: { type: 'object' },
  })
  @ApiOkResponse({ description: 'MemberDetail' })
  updateStatus(
    @CurrentUser() admin: CallerUser,
    @Param('id', new ZodValidationPipe(MemberIdSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateMemberStatusRequestSchema))
    body: UpdateMemberStatusRequest,
    @RequestId() requestId: string,
  ): Promise<MemberDetail> {
    return this.members.updateStatus(admin, id, body, requestId);
  }
}
