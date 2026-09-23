import { SERVICE_NAMES } from '@oneul-sai/constants';
import {
  API_ERROR_CODES,
  type AuthResponse,
  type ChangePasswordRequest,
  type ClientType,
  type LoginRequest,
  type LogoutRequest,
  type RefreshRequest,
} from '@oneul-sai/contracts';
import { createLogger, type Logger } from '@oneul-sai/logger';
import { apiError, type CallerUser } from '@oneul-sai/service-kit';
import { assertCallerUsable } from '../common/caller-status.js';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  MEMBER_SELECT,
  MEMBER_WITH_SECRET_SELECT,
  toMemberProfile,
  type MemberRecord,
} from '../members/member-select.js';
import type { TokenService } from '../tokens/token.service.js';
import {
  CURRENT_PASSWORD_MISMATCH_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
} from './auth.constants.js';
import type { LoginBackoffService } from './login-backoff.service.js';
import type { PasswordService } from './password.service.js';

const defaultLogger = createLogger({ service: SERVICE_NAMES.memberService });

/** 컨트롤러가 요청에서 뽑아 넘기는 것. 쿠키는 본문 `client`가 가리키는 이름만 읽어 `presentedToken`에 싣는다 (R1). */
export interface AuthRequestContext {
  /** `Origin` 헤더. `client: 'ADMIN'`이면 `ADMIN_ORIGIN`과 같아야 한다. */
  origin: string | undefined;
  path: string;
  requestId: string;
}

export interface PresentedTokenContext extends AuthRequestContext {
  presentedToken: string | undefined;
}

/** `/auth/password` · `/auth/logout-all`: 두 이름의 쿠키가 모두 실린다 (`Path=/api/v1/auth`). */
export interface PresentedTokensContext {
  presentedTokens: Partial<Record<ClientType, string>>;
  requestId: string;
}

export interface AuthResult {
  response: AuthResponse;
  /** 새 refresh 토큰 원문. 유예 응답이면 없다(`Set-Cookie` 없음). */
  refreshToken?: string;
}

export interface AuthServiceOptions {
  /** env `ADMIN_ORIGIN` (origin 형태로 정규화된 값) */
  adminOrigin: string;
  logger?: Logger;
}

type AuthPrisma = Pick<PrismaClient, 'member' | '$transaction'>;

type RejectCode =
  | typeof API_ERROR_CODES.INVALID_REFRESH_TOKEN
  | typeof API_ERROR_CODES.REFRESH_TOKEN_EXPIRED
  | typeof API_ERROR_CODES.REFRESH_TOKEN_REUSED
  | typeof API_ERROR_CODES.ACCOUNT_SUSPENDED;

type RefreshOutcome =
  | { kind: 'rejected'; code: RejectCode }
  | { kind: 'grace'; member: MemberRecord; familyId: string }
  | {
      kind: 'rotated';
      member: MemberRecord;
      familyId: string;
      refreshToken: string;
    };

const REJECT_MESSAGE: Record<RejectCode, string> = {
  INVALID_REFRESH_TOKEN: '다시 로그인해 주세요.',
  REFRESH_TOKEN_EXPIRED: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  REFRESH_TOKEN_REUSED: '보안을 위해 로그아웃되었습니다. 다시 로그인해 주세요.',
  ACCOUNT_SUSPENDED: '이용이 정지된 계정입니다. 오늘사이에 문의해 주세요.',
};

/**
 * SPEC-001 10절 login · refresh · logout · logout-all · password.
 * 본문 `client` → 읽을 쿠키 선택은 컨트롤러가 하고(`presentedToken`), 여기서는 `client: 'ADMIN'`의 Origin 판정과 토큰 판정을 한다.
 */
export class AuthService {
  private readonly logger: Logger;

  constructor(
    private readonly prisma: AuthPrisma,
    private readonly password: PasswordService,
    private readonly backoff: LoginBackoffService,
    private readonly tokens: TokenService,
    private readonly options: AuthServiceOptions,
  ) {
    this.logger = options.logger ?? defaultLogger;
  }

  async login(
    body: LoginRequest,
    ctx: PresentedTokenContext,
  ): Promise<AuthResult> {
    // DB 조회 · scrypt 전에 판정한다 (13절: ORIGIN_NOT_ALLOWED는 DB 조회 · scrypt 호출 없음).
    this.assertAdminOrigin(body.client, ctx);

    const member = await this.prisma.member.findUnique({
      where: { email: body.email },
      select: MEMBER_WITH_SECRET_SELECT,
    });

    if (member === null) {
      // 없는 이메일(탈퇴 계정 포함): 같은 체인 형태 + 더미 검증으로 응답 시간을 맞춘다 (12절 이메일 열거 방지).
      await this.backoff.runUnknown(body.email, () =>
        this.password.verifyDummy(body.password),
      );
      this.logger.warn('auth.login.failed', {
        reason: 'invalid',
        source: 'login',
        requestId: ctx.requestId,
      });
      throw this.invalidCredentials(INVALID_CREDENTIALS_MESSAGE);
    }

    const verified = await this.backoff.run(member.id, 'login', () =>
      this.password.verify(body.password, member.passwordHash),
    );
    if (!verified.ok) {
      this.logger.warn('auth.login.failed', {
        reason: 'invalid',
        memberId: member.id,
        source: 'login',
        requestId: ctx.requestId,
      });
      throw this.invalidCredentials(INVALID_CREDENTIALS_MESSAGE);
    }

    if (member.status === 'SUSPENDED') {
      this.logger.warn('auth.login.failed', {
        reason: 'suspended',
        memberId: member.id,
        source: 'login',
        requestId: ctx.requestId,
      });
      throw apiError(
        403,
        API_ERROR_CODES.ACCOUNT_SUSPENDED,
        REJECT_MESSAGE.ACCOUNT_SUSPENDED,
      );
    }
    if (member.status !== 'ACTIVE') {
      // WITHDRAWN 행은 이메일이 익명화돼 여기 오지 않지만, 어떤 경우에도 로그인시키지 않는다.
      throw this.invalidCredentials(INVALID_CREDENTIALS_MESSAGE);
    }

    if (body.client === 'ADMIN' && member.role !== 'ADMIN') {
      this.logger.warn('auth.login.failed', {
        reason: 'role',
        memberId: member.id,
        source: 'login',
        requestId: ctx.requestId,
      });
      throw apiError(
        403,
        API_ERROR_CODES.ROLE_NOT_ALLOWED,
        '운영자 계정이 아닙니다.',
      );
    }

    const issued = await this.prisma.$transaction(async (tx) => {
      if (ctx.presentedToken !== undefined) {
        // 같은 클라이언트의 유효한 refresh 쿠키가 실려 오면 그 가족을 폐기한다 — 고아 가족 방지 (7절).
        await this.tokens.revokePresentedFamily(
          tx,
          ctx.presentedToken,
          body.client,
          'RELOGIN',
        );
      }
      const family = await this.tokens.issueFamily(tx, {
        memberId: member.id,
        client: body.client,
      });
      await this.tokens.enforceFamilyLimit(tx, member.id);
      return family;
    });

    const accessToken = await this.tokens.signAccessToken(
      member.id,
      member.role,
    );
    this.logger.info('auth.login.succeeded', {
      memberId: member.id,
      client: body.client,
      requestId: ctx.requestId,
    });
    return {
      response: this.authResponse(accessToken, member),
      refreshToken: issued.token,
    };
  }

  /** 10절 "refresh — 처리 순서, 유예 창, 재사용 탐지" 1~8번. FOR UPDATE 한 트랜잭션. */
  async refresh(
    body: RefreshRequest,
    ctx: PresentedTokenContext,
  ): Promise<AuthResult> {
    this.assertAdminOrigin(body.client, ctx);

    const token = ctx.presentedToken;
    if (token === undefined) {
      throw apiError(
        400,
        API_ERROR_CODES.VALIDATION_FAILED,
        'refreshToken: 없음',
      );
    }

    const outcome = await this.prisma.$transaction(
      async (tx): Promise<RefreshOutcome> => {
        const row = await this.tokens.lockByToken(tx, token);
        if (row === null) {
          return { kind: 'rejected', code: 'INVALID_REFRESH_TOKEN' };
        }

        if (row.client !== body.client) {
          this.logger.warn('auth.refresh.client_mismatch', {
            memberId: row.memberId,
            tokenClient: row.client,
            requestClient: body.client,
            requestId: ctx.requestId,
          });
          return { kind: 'rejected', code: 'INVALID_REFRESH_TOKEN' };
        }

        const member = await tx.member.findUnique({
          where: { id: row.memberId },
          select: MEMBER_SELECT,
        });
        if (member === null || member.status === 'WITHDRAWN') {
          return { kind: 'rejected', code: 'INVALID_REFRESH_TOKEN' };
        }
        if (member.status === 'SUSPENDED') {
          return { kind: 'rejected', code: 'ACCOUNT_SUSPENDED' };
        }

        if (row.status === 'REVOKED') {
          if (row.revokedReason === 'REUSE') {
            this.logger.warn('auth.refresh.reuse_detected', {
              memberId: row.memberId,
              familyId: row.familyId,
              presented: 'revoked',
              requestId: ctx.requestId,
            });
            return { kind: 'rejected', code: 'REFRESH_TOKEN_REUSED' };
          }
          this.logger.info('auth.refresh.revoked_presented', {
            memberId: row.memberId,
            revokedReason: row.revokedReason,
            requestId: ctx.requestId,
          });
          return { kind: 'rejected', code: 'INVALID_REFRESH_TOKEN' };
        }

        if (row.status === 'ROTATED') {
          if (this.tokens.isWithinGrace(row)) {
            if (await this.tokens.familyHasActive(tx, row.familyId)) {
              this.logger.info('auth.refresh.grace_hit', {
                memberId: row.memberId,
                familyId: row.familyId,
                requestId: ctx.requestId,
              });
              return { kind: 'grace', member, familyId: row.familyId };
            }
            // 60초 안이지만 가족이 이미 폐기됐다 — 폐기 직후 옛 토큰으로 access token을 받는 창을 막는다.
            this.logger.info('auth.refresh.revoked_presented', {
              memberId: row.memberId,
              revokedReason: null,
              requestId: ctx.requestId,
            });
            return { kind: 'rejected', code: 'INVALID_REFRESH_TOKEN' };
          }
          await this.tokens.revokeFamily(tx, row.familyId, 'REUSE');
          this.logger.warn('auth.refresh.reuse_detected', {
            memberId: row.memberId,
            familyId: row.familyId,
            presented: 'rotated',
            requestId: ctx.requestId,
          });
          return { kind: 'rejected', code: 'REFRESH_TOKEN_REUSED' };
        }

        if (this.tokens.isExpired(row)) {
          return { kind: 'rejected', code: 'REFRESH_TOKEN_EXPIRED' };
        }

        const rotated = await this.tokens.rotate(tx, row);
        this.logger.info('auth.refresh.rotated', {
          memberId: row.memberId,
          familyId: row.familyId,
          requestId: ctx.requestId,
        });
        return {
          kind: 'rotated',
          member,
          familyId: row.familyId,
          refreshToken: rotated.token,
        };
      },
    );

    if (outcome.kind === 'rejected') {
      throw apiError(
        outcome.code === 'ACCOUNT_SUSPENDED' ? 403 : 401,
        API_ERROR_CODES[outcome.code],
        REJECT_MESSAGE[outcome.code],
      );
    }

    const accessToken = await this.tokens.signAccessToken(
      outcome.member.id,
      outcome.member.role,
    );
    return {
      response: this.authResponse(accessToken, outcome.member),
      ...(outcome.kind === 'rotated'
        ? { refreshToken: outcome.refreshToken }
        : {}),
    };
  }

  /** 10절 logout: 완전 멱등. 본문 검증(컨트롤러의 파이프) 외에는 어떤 경우에도 예외를 던지지 않는다. 쿠키 삭제는 컨트롤러가 한다. */
  async logout(body: LogoutRequest, ctx: PresentedTokenContext): Promise<void> {
    if (!this.adminOriginAllowed(body.client, ctx)) {
      this.logger.warn('auth.origin_rejected', {
        requestClient: body.client,
        path: ctx.path,
        requestId: ctx.requestId,
      });
      return;
    }
    const token = ctx.presentedToken;
    if (token === undefined) return;

    await this.prisma.$transaction(async (tx) => {
      const row = await this.tokens.lockByToken(tx, token);
      if (
        row === null ||
        row.status !== 'ACTIVE' ||
        row.client !== body.client
      ) {
        return;
      }
      await this.tokens.revokeFamily(tx, row.familyId, 'LOGOUT');
      this.logger.info('auth.logout', {
        memberId: row.memberId,
        familyId: row.familyId,
        client: body.client,
        requestId: ctx.requestId,
      });
    });
  }

  /** 10절 logout-all. 돌려주는 `clearClients`는 요청에 실린 이 회원의 쿠키 이름들 — 컨트롤러가 지운다. */
  async logoutAll(
    user: CallerUser,
    ctx: PresentedTokensContext,
  ): Promise<{ clearClients: ClientType[] }> {
    const member = await this.prisma.member.findUnique({
      where: { id: user.id },
      select: MEMBER_SELECT,
    });
    assertCallerUsable(member);

    const result = await this.prisma.$transaction(async (tx) => {
      const clearClients: ClientType[] = [];
      for (const [client, token] of presentedEntries(ctx.presentedTokens)) {
        const row = await this.tokens.findByToken(tx, token);
        if (row !== null && row.memberId === member.id) {
          clearClients.push(client);
        }
      }
      const revoked = await this.tokens.revokeAllForMember(
        tx,
        member.id,
        'LOGOUT',
      );
      return { clearClients, revokedFamilies: revoked.families };
    });

    this.logger.info('auth.logout_all', {
      memberId: member.id,
      revokedFamilies: result.revokedFamilies,
      requestId: ctx.requestId,
    });
    return { clearClients: result.clearClients };
  }

  /** 10절 `POST /auth/password` (D7). 현재 가족(요청 쿠키의 유효 토큰이 속한 familyId)만 남기고 폐기한다. `Set-Cookie` 없음. */
  async changePassword(
    user: CallerUser,
    body: ChangePasswordRequest,
    ctx: PresentedTokensContext,
  ): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { id: user.id },
      select: MEMBER_WITH_SECRET_SELECT,
    });
    assertCallerUsable(member);

    const verified = await this.backoff.run(member.id, 'password', () =>
      this.password.verify(body.currentPassword, member.passwordHash),
    );
    if (!verified.ok) {
      this.logger.warn('auth.login.failed', {
        reason: 'invalid',
        memberId: member.id,
        source: 'password',
        requestId: ctx.requestId,
      });
      throw this.invalidCredentials(CURRENT_PASSWORD_MISMATCH_MESSAGE);
    }

    const passwordHash = await this.password.hash(body.newPassword);
    const revokedFamilies = await this.prisma.$transaction(async (tx) => {
      const keep = await this.currentFamilies(
        tx,
        member.id,
        ctx.presentedTokens,
      );
      await tx.member.update({
        where: { id: member.id },
        data: { passwordHash, failedLoginCount: 0, lastFailedLoginAt: null },
      });
      const revoked = await this.tokens.revokeAllForMember(
        tx,
        member.id,
        'PASSWORD_CHANGED',
        { exceptFamilyIds: keep },
      );
      return revoked.families;
    });

    this.logger.info('auth.password.changed', {
      memberId: member.id,
      revokedFamilies,
      requestId: ctx.requestId,
    });
  }

  /**
   * 현재 가족 = 요청 쿠키(두 이름 중 이 회원 소유인 것)의 토큰이 ACTIVE이거나 ROTATED(유예 창 안)이고 만료되지 않았을 때 그 familyId.
   * 쿠키가 없거나 다른 회원의 것이거나 REVOKED · 만료면 예외 없이 전부 폐기된다 (7절 ChangePasswordRequest).
   */
  private async currentFamilies(
    tx: Prisma.TransactionClient,
    memberId: string,
    presentedTokens: Partial<Record<ClientType, string>>,
  ): Promise<string[]> {
    const keep: string[] = [];
    for (const [, token] of presentedEntries(presentedTokens)) {
      const row = await this.tokens.findByToken(tx, token);
      if (
        row === null ||
        row.memberId !== memberId ||
        this.tokens.isExpired(row)
      ) {
        continue;
      }
      const usable =
        row.status === 'ACTIVE' ||
        (row.status === 'ROTATED' && this.tokens.isWithinGrace(row));
      if (usable && !keep.includes(row.familyId)) {
        keep.push(row.familyId);
      }
    }
    return keep;
  }

  private adminOriginAllowed(
    client: ClientType,
    ctx: AuthRequestContext,
  ): boolean {
    return client !== 'ADMIN' || ctx.origin === this.options.adminOrigin;
  }

  /** `client: 'ADMIN'` login · refresh: `Origin`이 없거나 `ADMIN_ORIGIN`과 다르면 403. 값은 로그에 남기지 않는다 (14절). */
  private assertAdminOrigin(client: ClientType, ctx: AuthRequestContext): void {
    if (this.adminOriginAllowed(client, ctx)) return;
    this.logger.warn('auth.origin_rejected', {
      requestClient: client,
      path: ctx.path,
      requestId: ctx.requestId,
    });
    throw apiError(
      403,
      API_ERROR_CODES.ORIGIN_NOT_ALLOWED,
      '허용되지 않은 출처의 요청입니다.',
    );
  }

  private invalidCredentials(message: string) {
    return apiError(401, API_ERROR_CODES.INVALID_CREDENTIALS, message);
  }

  private authResponse(
    accessToken: string,
    member: MemberRecord,
  ): AuthResponse {
    return {
      accessToken,
      expiresIn: this.tokens.accessTtlSeconds,
      member: toMemberProfile(member),
    };
  }
}

function presentedEntries(
  tokens: Partial<Record<ClientType, string>>,
): Array<[ClientType, string]> {
  const entries: Array<[ClientType, string]> = [];
  for (const client of ['WEB', 'ADMIN'] as const) {
    const token = tokens[client];
    if (token !== undefined) entries.push([client, token]);
  }
  return entries;
}
