import { SERVICE_NAMES } from '@oneul-sai/constants';
import {
  API_ERROR_CODES,
  SIGNUP_MIN_AGE,
  type MemberDetail,
  type MemberListQuery,
  type MemberListResponse,
  type MemberProfile,
  type SignupRequest,
  type UpdateMemberStatusRequest,
  type UpdateMyProfileRequest,
  type WithdrawRequest,
} from '@oneul-sai/contracts';
import { createLogger, type Logger } from '@oneul-sai/logger';
import {
  CURRENT_PASSWORD_MISMATCH_MESSAGE,
  WITHDRAWN_PASSWORD_HASH,
} from '../auth/auth.constants.js';
import type { CallerUser } from '../auth/decorators/current-user.js';
import type { LoginBackoffService } from '../auth/login-backoff.service.js';
import type { PasswordService } from '../auth/password.service.js';
import { apiError } from '../common/api-error.js';
import { assertCallerUsable } from '../common/caller-status.js';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { TokenService } from '../tokens/token.service.js';
import {
  MEMBER_SELECT,
  MEMBER_WITH_SECRET_SELECT,
  toMemberDetail,
  toMemberProfile,
  toMemberSummary,
} from './member-select.js';

const defaultLogger = createLogger({ service: SERVICE_NAMES.memberService });

export interface MembersServiceOptions {
  logger?: Logger;
  now?: () => Date;
}

type MembersPrisma = Pick<PrismaClient, 'member' | '$transaction'>;

/** Prisma P2002 (unique 위반). `Member`의 unique는 `email`뿐이다 (9절). */
export function isUniqueViolation(error: unknown, field: string): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === 'string') return target.includes(field);
  return true;
}

/** 이메일 · 이름 부분 일치 + 휴대폰 앞자리 일치 (7절 MemberListQuery). 정렬은 createdAt 내림차순 고정. */
export function buildListWhere(
  query: MemberListQuery,
): Prisma.MemberWhereInput {
  const where: Prisma.MemberWhereInput = {};
  if (query.status !== undefined) where.status = query.status;
  if (query.role !== undefined) where.role = query.role;
  if (query.query !== undefined && query.query.length > 0) {
    const or: Prisma.MemberWhereInput[] = [
      { email: { contains: query.query, mode: 'insensitive' } },
      { name: { contains: query.query } },
    ];
    const digits = query.query.replace(/[\s-]/g, '');
    if (/^\d+$/.test(digits)) {
      or.push({ phone: { startsWith: digits } });
    }
    where.OR = or;
  }
  return where;
}

/** SPEC-001 members: 가입 · me · 프로필 수정 · 탈퇴(익명화) · 운영자 목록 · 상세 · 상태 변경. */
export class MembersService {
  private readonly logger: Logger;
  private readonly now: () => Date;

  constructor(
    private readonly prisma: MembersPrisma,
    private readonly password: PasswordService,
    private readonly backoff: LoginBackoffService,
    private readonly tokens: TokenService,
    options: MembersServiceOptions = {},
  ) {
    this.logger = options.logger ?? defaultLogger;
    this.now = options.now ?? (() => new Date());
  }

  async signup(body: SignupRequest): Promise<MemberProfile> {
    const now = this.now();
    // ★B: birthYear ≤ 현재 연도 − 19. 하한(1900)은 Zod가 본다.
    if (body.birthYear > now.getFullYear() - SIGNUP_MIN_AGE) {
      throw apiError(
        400,
        API_ERROR_CODES.AGE_NOT_ALLOWED,
        `오늘사이는 만 ${SIGNUP_MIN_AGE}세 이상만 가입할 수 있습니다.`,
      );
    }
    if (body.consents.privacy !== true) {
      throw apiError(
        400,
        API_ERROR_CODES.CONSENT_REQUIRED,
        '개인정보 수집 · 이용에 동의해 주세요.',
      );
    }

    const passwordHash = await this.password.hash(body.password);
    try {
      // 사전 조회를 하지 않는다 — DB unique 제약이 최종 방어다 (11절).
      const member = await this.prisma.member.create({
        data: {
          email: body.email,
          passwordHash,
          name: body.name,
          gender: body.gender,
          birthYear: body.birthYear,
          phone: body.phone,
          privacyAgreedAt: now,
          marketingAgreedAt: body.consents.marketing ? now : null,
        },
        select: MEMBER_SELECT,
      });
      this.logger.info('member.created', {
        memberId: member.id,
        role: member.role,
      });
      return toMemberProfile(member);
    } catch (error) {
      if (isUniqueViolation(error, 'email')) {
        throw apiError(
          409,
          API_ERROR_CODES.EMAIL_ALREADY_EXISTS,
          '이미 가입된 이메일입니다. 로그인해 주세요.',
        );
      }
      throw error;
    }
  }

  async me(user: CallerUser): Promise<MemberProfile> {
    const member = await this.prisma.member.findUnique({
      where: { id: user.id },
      select: MEMBER_SELECT,
    });
    assertCallerUsable(member);
    return toMemberProfile(member);
  }

  /** 휴대폰 변경은 현재 비밀번호 재확인(D9) + 로그인과 같은 백오프. 마케팅 동의는 멱등. */
  async updateMyProfile(
    user: CallerUser,
    body: UpdateMyProfileRequest,
    requestId: string,
  ): Promise<MemberProfile> {
    const member = await this.prisma.member.findUnique({
      where: { id: user.id },
      select: MEMBER_WITH_SECRET_SELECT,
    });
    assertCallerUsable(member);

    if (body.phone !== undefined) {
      const currentPassword = body.currentPassword;
      if (currentPassword === undefined) {
        throw apiError(
          400,
          API_ERROR_CODES.VALIDATION_FAILED,
          'currentPassword: 규칙',
        );
      }
      const verified = await this.backoff.run(member.id, 'phone', () =>
        this.password.verify(currentPassword, member.passwordHash),
      );
      if (!verified.ok) {
        this.logger.warn('auth.login.failed', {
          reason: 'invalid',
          memberId: member.id,
          source: 'phone',
          requestId,
        });
        throw apiError(
          401,
          API_ERROR_CODES.INVALID_CREDENTIALS,
          CURRENT_PASSWORD_MISMATCH_MESSAGE,
        );
      }
    }

    const now = this.now();
    const data: Prisma.MemberUpdateInput = {};
    const phoneChanged =
      body.phone !== undefined && body.phone !== member.phone;
    if (phoneChanged) data.phone = body.phone;
    if (body.marketingConsent === true && member.marketingAgreedAt === null) {
      data.marketingAgreedAt = now;
    }
    if (body.marketingConsent === false && member.marketingAgreedAt !== null) {
      data.marketingAgreedAt = null;
      data.marketingWithdrawnAt = now;
    }

    const updated =
      Object.keys(data).length > 0
        ? await this.prisma.member.update({
            where: { id: member.id },
            data,
            select: MEMBER_SELECT,
          })
        : member;

    if (phoneChanged) {
      this.logger.info('member.phone_changed', {
        memberId: member.id,
        requestId,
      });
    }
    return toMemberProfile(updated);
  }

  /** 탈퇴 = 즉시 익명화 (D10, 12절). 한 트랜잭션: Member UPDATE + RefreshToken deleteMany. */
  async withdraw(
    user: CallerUser,
    body: WithdrawRequest,
    requestId: string,
  ): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { id: user.id },
      select: MEMBER_WITH_SECRET_SELECT,
    });
    assertCallerUsable(member);

    const verified = await this.backoff.run(member.id, 'withdraw', () =>
      this.password.verify(body.password, member.passwordHash),
    );
    if (!verified.ok) {
      this.logger.warn('auth.login.failed', {
        reason: 'invalid',
        memberId: member.id,
        source: 'withdraw',
        requestId,
      });
      throw apiError(
        401,
        API_ERROR_CODES.INVALID_CREDENTIALS,
        CURRENT_PASSWORD_MISMATCH_MESSAGE,
      );
    }

    const now = this.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: member.id },
        data: {
          status: 'WITHDRAWN',
          withdrawnAt: now,
          email: `withdrawn+${member.id}@invalid`,
          name: null,
          gender: null,
          birthYear: null,
          phone: null,
          passwordHash: WITHDRAWN_PASSWORD_HASH,
          failedLoginCount: 0,
          lastFailedLoginAt: null,
          marketingAgreedAt: null,
          marketingWithdrawnAt:
            member.marketingAgreedAt !== null
              ? now
              : member.marketingWithdrawnAt,
        },
      });
      await tx.refreshToken.deleteMany({ where: { memberId: member.id } });
    });

    this.logger.info('member.withdrawn', { memberId: member.id, requestId });
  }

  /** 운영자 목록. 접속기록 `member.list_viewed` — 검색어 자체는 남기지 않는다 (12절). */
  async list(
    admin: CallerUser,
    query: MemberListQuery,
    requestId: string,
  ): Promise<MemberListResponse> {
    await this.assertAdminUsable(admin);

    const where = buildListWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        select: MEMBER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.member.count({ where }),
    ]);

    this.logger.info('member.list_viewed', {
      adminId: admin.id,
      hasFilter:
        query.query !== undefined ||
        query.status !== undefined ||
        query.role !== undefined,
      count: rows.length,
      requestId,
    });
    return {
      items: rows.map(toMemberSummary),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 운영자 상세. WITHDRAWN은 404가 아니라 익명화된 값을 보여 준다. 접속기록 `member.detail_viewed`. */
  async detail(
    admin: CallerUser,
    memberId: string,
    requestId: string,
  ): Promise<MemberDetail> {
    await this.assertAdminUsable(admin);

    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: MEMBER_SELECT,
    });
    if (member === null) {
      throw this.memberNotFound();
    }
    this.logger.info('member.detail_viewed', {
      adminId: admin.id,
      memberId,
      requestId,
    });
    return toMemberDetail(member);
  }

  /** 6절 상태 머신: ACTIVE ↔ SUSPENDED. 자기 자신 400, WITHDRAWN 409, 같은 상태는 no-op 200. 정지 시 세션 전부 폐기. */
  async updateStatus(
    admin: CallerUser,
    memberId: string,
    body: UpdateMemberStatusRequest,
    requestId: string,
  ): Promise<MemberDetail> {
    await this.assertAdminUsable(admin);

    if (memberId === admin.id) {
      throw apiError(
        400,
        API_ERROR_CODES.SELF_STATUS_CHANGE,
        '자기 계정의 상태는 바꿀 수 없습니다.',
      );
    }
    const target = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: MEMBER_SELECT,
    });
    if (target === null) {
      throw this.memberNotFound();
    }
    if (target.status === 'WITHDRAWN') {
      throw apiError(
        409,
        API_ERROR_CODES.INVALID_STATUS_TRANSITION,
        '탈퇴한 회원의 상태는 바꿀 수 없습니다.',
      );
    }
    if (target.status === body.status) {
      return toMemberDetail(target);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.member.update({
        where: { id: memberId },
        data: { status: body.status, statusReason: body.reason ?? null },
        select: MEMBER_SELECT,
      });
      if (body.status === 'SUSPENDED') {
        await this.tokens.revokeAllForMember(tx, memberId, 'SUSPENDED');
      }
      return row;
    });

    this.logger.info('member.status_changed', {
      memberId,
      from: target.status,
      to: body.status,
      adminId: admin.id,
      requestId,
    });
    return toMemberDetail(updated);
  }

  /** ADMIN 경로도 호출한 운영자의 상태를 확인한다 (7절 엔드포인트 요약). */
  private async assertAdminUsable(admin: CallerUser): Promise<void> {
    const caller = await this.prisma.member.findUnique({
      where: { id: admin.id },
      select: { status: true },
    });
    assertCallerUsable(caller);
  }

  private memberNotFound() {
    return apiError(
      404,
      API_ERROR_CODES.MEMBER_NOT_FOUND,
      '회원을 찾을 수 없습니다.',
    );
  }
}
