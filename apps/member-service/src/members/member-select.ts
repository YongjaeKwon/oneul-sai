import type {
  MemberDetail,
  MemberProfile,
  MemberSummary,
} from '@oneul-sai/contracts';
import type { Prisma } from '../generated/prisma/client.js';

// SPEC-001 13절: 비밀번호 해시는 어떤 응답에도 싣지 않는다 — Prisma `select`로 명시 선택한다.

export const MEMBER_SELECT = {
  id: true,
  email: true,
  name: true,
  gender: true,
  birthYear: true,
  phone: true,
  role: true,
  status: true,
  statusReason: true,
  failedLoginCount: true,
  lastFailedLoginAt: true,
  privacyAgreedAt: true,
  marketingAgreedAt: true,
  marketingWithdrawnAt: true,
  withdrawnAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.MemberSelect;

/** 비밀번호 확인이 필요한 경로(로그인 · 탈퇴 · 비밀번호 변경 · 휴대폰 변경)에서만 쓴다. */
export const MEMBER_WITH_SECRET_SELECT = {
  ...MEMBER_SELECT,
  passwordHash: true,
} as const satisfies Prisma.MemberSelect;

export type MemberRecord = Prisma.MemberGetPayload<{
  select: typeof MEMBER_SELECT;
}>;
export type MemberWithSecret = Prisma.MemberGetPayload<{
  select: typeof MEMBER_WITH_SECRET_SELECT;
}>;

const iso = (value: Date): string => value.toISOString();
const isoOrNull = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

/** 본인용 응답. ADMIN의 `gender` · `birthYear` · `phone`은 DB가 null이라 그대로 null이다 (7절). */
export function toMemberProfile(member: MemberRecord): MemberProfile {
  if (member.name === null) {
    // 탈퇴하지 않은 회원은 DB CHECK(Member_required_fields)로 이름이 보장된다. 탈퇴 회원은 이 응답에 이르지 않는다.
    throw new Error('탈퇴하지 않은 회원의 name이 null이다');
  }
  return {
    id: member.id,
    email: member.email,
    name: member.name,
    gender: member.gender,
    birthYear: member.birthYear,
    phone: member.phone,
    role: member.role,
    status: member.status,
    marketingConsent: member.marketingAgreedAt !== null,
    createdAt: iso(member.createdAt),
  };
}

export function toMemberSummary(member: MemberRecord): MemberSummary {
  return {
    id: member.id,
    email: member.email,
    name: member.name,
    gender: member.gender,
    birthYear: member.birthYear,
    phone: member.phone,
    role: member.role,
    status: member.status,
    createdAt: iso(member.createdAt),
  };
}

export function toMemberDetail(member: MemberRecord): MemberDetail {
  return {
    ...toMemberSummary(member),
    statusReason: member.statusReason,
    withdrawnAt: isoOrNull(member.withdrawnAt),
    updatedAt: iso(member.updatedAt),
    privacyAgreedAt: iso(member.privacyAgreedAt),
    marketingAgreedAt: isoOrNull(member.marketingAgreedAt),
    marketingWithdrawnAt: isoOrNull(member.marketingWithdrawnAt),
    failedLoginCount: member.failedLoginCount,
    lastFailedLoginAt: isoOrNull(member.lastFailedLoginAt),
  };
}
