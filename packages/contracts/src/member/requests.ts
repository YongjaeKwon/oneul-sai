import { z } from 'zod';

import {
  AccountStatusSchema,
  GenderSchema,
  MemberRoleSchema,
} from './enums.js';
import {
  BirthYearSchema,
  EmailSchema,
  NameSchema,
  PasswordInputSchema,
  PasswordSchema,
  PhoneSchema,
} from './fields.js';

// SPEC-001 7절 요청 스키마. 모두 strict(모르는 필드 → 400 VALIDATION_FAILED).
// 스키마가 거르지 않고 서비스가 별도 코드로 판정하는 규칙:
//   - birthYear > 현재 연도 − SIGNUP_MIN_AGE → 400 AGE_NOT_ALLOWED
//   - consents.privacy !== true → 400 CONSENT_REQUIRED

export const SignupConsentsSchema = z.strictObject({
  /** 개인정보 수집 · 이용 동의(필수). `true`가 아니면 서비스가 400 `CONSENT_REQUIRED`. */
  privacy: z.boolean({
    error: '개인정보 수집 · 이용 동의 여부를 알려 주세요.',
  }),
  /** 마케팅 수신 동의(선택). */
  marketing: z.boolean({ error: '마케팅 수신 동의 여부를 알려 주세요.' }),
});
export type SignupConsents = z.infer<typeof SignupConsentsSchema>;

/** `POST /api/v1/members`. `role`은 받지 않는다(strict). */
export const SignupRequestSchema = z.strictObject({
  email: EmailSchema,
  password: PasswordSchema,
  name: NameSchema,
  gender: GenderSchema,
  birthYear: BirthYearSchema,
  phone: PhoneSchema,
  consents: SignupConsentsSchema,
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

/** `PATCH /api/v1/members/me`. `phone`을 바꾸려면 `currentPassword`가 필수(D9). `phone` · `marketingConsent` 중 하나는 있어야 한다. */
export const UpdateMyProfileRequestSchema = z
  .strictObject({
    phone: PhoneSchema.optional(),
    marketingConsent: z.boolean().optional(),
    currentPassword: PasswordInputSchema.optional(),
  })
  .refine(
    (value) =>
      value.phone !== undefined || value.marketingConsent !== undefined,
    { error: '바꿀 항목이 없습니다.', path: ['phone'] },
  )
  .refine(
    (value) => value.phone === undefined || value.currentPassword !== undefined,
    {
      error: '휴대폰 번호를 바꾸려면 현재 비밀번호를 입력해 주세요.',
      path: ['currentPassword'],
    },
  );
export type UpdateMyProfileRequest = z.infer<
  typeof UpdateMyProfileRequestSchema
>;

/** `DELETE /api/v1/members/me` 본문. 비밀번호 재확인. */
export const WithdrawRequestSchema = z.strictObject({
  password: PasswordInputSchema,
});
export type WithdrawRequest = z.infer<typeof WithdrawRequestSchema>;

export const MEMBER_LIST_QUERY_MAX_LENGTH = 100;
export const MEMBER_LIST_DEFAULT_PAGE_SIZE = 20;
export const MEMBER_LIST_MAX_PAGE_SIZE = 100;

/** `GET /api/v1/members` query string(운영자). 값은 문자열로 오므로 숫자는 coerce. 정렬은 `createdAt` 내림차순 고정. */
export const MemberListQuerySchema = z.strictObject({
  /** 이메일 · 이름 부분 일치 + 휴대폰 앞자리 일치. */
  query: z.string().trim().max(MEMBER_LIST_QUERY_MAX_LENGTH).optional(),
  status: AccountStatusSchema.optional(),
  role: MemberRoleSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MEMBER_LIST_MAX_PAGE_SIZE)
    .default(MEMBER_LIST_DEFAULT_PAGE_SIZE),
});
export type MemberListQuery = z.infer<typeof MemberListQuerySchema>;

export const STATUS_REASON_MAX_LENGTH = 200;

/** `PATCH /api/v1/members/:id/status`(운영자). `WITHDRAWN`으로는 바꿀 수 없고, `SUSPENDED`에는 사유가 필수. */
export const UpdateMemberStatusRequestSchema = z
  .strictObject({
    status: AccountStatusSchema.exclude(['WITHDRAWN']),
    reason: z
      .string()
      .trim()
      .max(STATUS_REASON_MAX_LENGTH, { error: '사유가 너무 깁니다.' })
      .optional(),
  })
  .refine(
    (value) =>
      value.status !== 'SUSPENDED' ||
      (value.reason !== undefined && value.reason.length > 0),
    { error: '정지 사유를 입력해 주세요.', path: ['reason'] },
  );
export type UpdateMemberStatusRequest = z.infer<
  typeof UpdateMemberStatusRequestSchema
>;
