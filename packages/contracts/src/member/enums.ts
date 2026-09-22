import { z } from 'zod';

// SPEC-001 7절 "공통 enum". Prisma enum(apps/member-service/prisma/schema.prisma)과 값이 같아야 한다.

export const GENDERS = ['MALE', 'FEMALE'] as const;
export const GenderSchema = z.enum(GENDERS);
export type Gender = z.infer<typeof GenderSchema>;

export const MEMBER_ROLES = ['MEMBER', 'ADMIN'] as const;
export const MemberRoleSchema = z.enum(MEMBER_ROLES);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

export const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED', 'WITHDRAWN'] as const;
export const AccountStatusSchema = z.enum(ACCOUNT_STATUSES);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;
