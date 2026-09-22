import { z } from 'zod';

import {
  AccountStatusSchema,
  GenderSchema,
  MemberRoleSchema,
} from './enums.js';

// SPEC-001 7절 응답 스키마. 비밀번호 해시는 어떤 응답에도 없다.

const IsoDateTime = z.iso.datetime();

/** 본인용 응답(`POST /members`, `GET · PATCH /members/me`, `AuthResponse.member`). `gender` · `birthYear` · `phone`은 ADMIN이면 null. */
export const MemberProfileSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  gender: GenderSchema.nullable(),
  birthYear: z.number().int().nullable(),
  phone: z.string().nullable(),
  role: MemberRoleSchema,
  status: AccountStatusSchema,
  marketingConsent: z.boolean(),
  createdAt: IsoDateTime,
});
export type MemberProfile = z.infer<typeof MemberProfileSchema>;

/** 운영자 목록 한 줄. `name` · `gender` · `birthYear` · `phone`은 ADMIN 또는 WITHDRAWN이면 null. */
export const MemberSummarySchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string().nullable(),
  gender: GenderSchema.nullable(),
  birthYear: z.number().int().nullable(),
  phone: z.string().nullable(),
  role: MemberRoleSchema,
  status: AccountStatusSchema,
  createdAt: IsoDateTime,
});
export type MemberSummary = z.infer<typeof MemberSummarySchema>;

/** 운영자 상세 = MemberSummary + 상태 사유 · 동의 시각 · 로그인 실패 카운터(WITHDRAWN이면 0 · null). */
export const MemberDetailSchema = MemberSummarySchema.extend({
  statusReason: z.string().nullable(),
  withdrawnAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime,
  privacyAgreedAt: IsoDateTime,
  marketingAgreedAt: IsoDateTime.nullable(),
  marketingWithdrawnAt: IsoDateTime.nullable(),
  failedLoginCount: z.number().int().min(0),
  lastFailedLoginAt: IsoDateTime.nullable(),
});
export type MemberDetail = z.infer<typeof MemberDetailSchema>;

/** `GET /members` 응답. 목록 형식 `{ items, total, page, pageSize }`(7절 공통 규칙). */
export const MemberListResponseSchema = z.object({
  items: z.array(MemberSummarySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type MemberListResponse = z.infer<typeof MemberListResponseSchema>;
