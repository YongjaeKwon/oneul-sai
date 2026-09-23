import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ChangePasswordRequestSchema,
  HEADER_INTERNAL_TOKEN,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
  type AuthResponse,
  type ChangePasswordRequest,
  type LoginRequest,
  type LogoutRequest,
  type RefreshRequest,
} from '@oneul-sai/contracts';
import {
  CurrentUser,
  JsonContentTypeGuard,
  Public,
  requestIdOf,
  requestPathname,
  ZodValidationPipe,
  type CallerUser,
} from '@oneul-sai/service-kit';
import type { Request, Response } from 'express';
import {
  clearRefreshCookie,
  COOKIE_ENV,
  readAllRefreshCookies,
  readRefreshCookie,
  setRefreshCookie,
  type CookieEnv,
} from '../common/cookies.js';
import { AuthService, type AuthRequestContext } from './auth.service.js';

const AUTH_RESPONSE = {
  description:
    'AuthResponse { accessToken, expiresIn, member: MemberProfile }. refresh 토큰은 Set-Cookie(onulsai_rt_web | onulsai_rt_admin)로만 온다.',
};

@ApiTags('auth')
@ApiHeader({
  name: HEADER_INTERNAL_TOKEN,
  required: true,
  description: 'Gateway ↔ 서비스 공유 비밀 (env INTERNAL_API_TOKEN)',
})
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(COOKIE_ENV) private readonly cookieEnv: CookieEnv,
  ) {}

  @Post('login')
  @Public()
  @UseGuards(JsonContentTypeGuard)
  @HttpCode(200)
  @ApiOperation({
    summary: '로그인 — access token + refresh 쿠키 발급 (SPEC-001 10절)',
    description:
      '`client`가 쿠키 이름(WEB → onulsai_rt_web Lax, ADMIN → onulsai_rt_admin Strict)과 ADMIN 전용 Origin 확인을 정한다. 실패 문구는 이메일 존재 여부와 무관하게 하나다. 15분 안 4회 실패 뒤로는 검증 전 지연이 붙는다.',
  })
  @ApiBody({
    description:
      'LoginRequest (@oneul-sai/contracts) — { email, password, client }',
    schema: { type: 'object' },
  })
  @ApiOkResponse(AUTH_RESPONSE)
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.login(body, {
      ...this.context(req),
      presentedToken: readRefreshCookie(req, body.client),
    });
    if (result.refreshToken !== undefined) {
      setRefreshCookie(res, body.client, result.refreshToken, this.cookieEnv);
    }
    return result.response;
  }

  @Post('refresh')
  @Public()
  @UseGuards(JsonContentTypeGuard)
  @HttpCode(200)
  @ApiOperation({
    summary: 'refresh 토큰 회전 — 새 access token + 새 refresh 쿠키',
    description:
      '본문 `client`가 가리키는 쿠키만 읽는다(R1). 유예 창(60초) 응답은 access token만 주고 Set-Cookie가 없다. 유예 창 밖의 옛 토큰은 재사용으로 보고 가족을 폐기한다.',
  })
  @ApiBody({
    description: 'RefreshRequest — { client }',
    schema: { type: 'object' },
  })
  @ApiOkResponse(AUTH_RESPONSE)
  async refresh(
    @Body(new ZodValidationPipe(RefreshRequestSchema)) body: RefreshRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.refresh(body, {
      ...this.context(req),
      presentedToken: readRefreshCookie(req, body.client),
    });
    if (result.refreshToken !== undefined) {
      setRefreshCookie(res, body.client, result.refreshToken, this.cookieEnv);
    }
    return result.response;
  }

  @Post('logout')
  @Public()
  @UseGuards(JsonContentTypeGuard)
  @HttpCode(204)
  @ApiOperation({
    summary: '로그아웃 — 가족(세션) 폐기 + 쿠키 삭제. 완전 멱등',
    description:
      'access token이 만료돼도 호출할 수 있다. 본문 검증 실패(400) 외에는 어떤 경우에도 204 + `client` 쿠키 삭제.',
  })
  @ApiBody({
    description: 'LogoutRequest — { client }',
    schema: { type: 'object' },
  })
  @ApiNoContentResponse({ description: '쿠키 삭제(Max-Age=0)' })
  async logout(
    @Body(new ZodValidationPipe(LogoutRequestSchema)) body: LogoutRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(body, {
      ...this.context(req),
      presentedToken: readRefreshCookie(req, body.client),
    });
    clearRefreshCookie(res, body.client, this.cookieEnv);
  }

  @Post('logout-all')
  @HttpCode(204)
  @ApiOperation({
    summary: '모든 기기에서 로그아웃 — 이 회원의 ACTIVE 토큰 전부 폐기 (D8)',
  })
  @ApiHeader({ name: HEADER_USER_ID, required: true })
  @ApiHeader({ name: HEADER_USER_ROLE, required: true })
  @ApiNoContentResponse({
    description: '요청에 실린 이 회원의 refresh 쿠키 삭제',
  })
  async logoutAll(
    @CurrentUser() user: CallerUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { clearClients } = await this.auth.logoutAll(user, {
      presentedTokens: readAllRefreshCookies(req),
      requestId: requestIdOf(req),
    });
    for (const client of clearClients) {
      clearRefreshCookie(res, client, this.cookieEnv);
    }
  }

  @Post('password')
  @UseGuards(JsonContentTypeGuard)
  @HttpCode(204)
  @ApiOperation({
    summary:
      '비밀번호 변경 — 현재 비밀번호 확인, 현재 가족을 제외한 세션 폐기 (D7)',
  })
  @ApiHeader({ name: HEADER_USER_ID, required: true })
  @ApiHeader({ name: HEADER_USER_ROLE, required: true })
  @ApiBody({
    description: 'ChangePasswordRequest — { currentPassword, newPassword }',
    schema: { type: 'object' },
  })
  @ApiNoContentResponse({ description: 'Set-Cookie 없음(현재 가족 유지)' })
  async changePassword(
    @CurrentUser() user: CallerUser,
    @Body(new ZodValidationPipe(ChangePasswordRequestSchema))
    body: ChangePasswordRequest,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.changePassword(user, body, {
      presentedTokens: readAllRefreshCookies(req),
      requestId: requestIdOf(req),
    });
  }

  private context(req: Request): AuthRequestContext {
    return {
      origin:
        typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
      path: requestPathname(req),
      requestId: requestIdOf(req),
    };
  }
}
