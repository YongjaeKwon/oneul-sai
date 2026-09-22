import {
  BirthYearSchema,
  ChangePasswordRequestSchema,
  GENDERS,
  LoginRequestSchema,
  PASSWORD_MAX_LENGTH,
  PhoneSchema,
  SIGNUP_MIN_AGE,
  SignupRequestSchema,
  WithdrawRequestSchema,
  type MemberProfile,
  type UpdateMyProfileRequest,
} from '@oneul-sai/contracts';
import { z } from 'zod';

// 화면 폼 스키마 — 계약(@oneul-sai/contracts)의 요청 스키마를 그대로 쓰되,
// 서비스가 별도 코드로 판정하는 규칙(만 19세 · 필수 동의)과 화면에서만 필요한 검사(비밀번호 확인 일치)를 더한다.
// 문구는 SPEC-001 4절 "참가자 웹".

export const AGE_NOT_ALLOWED_MESSAGE =
  '오늘사이는 만 19세 이상만 가입할 수 있습니다.';
export const PRIVACY_CONSENT_MESSAGE = '개인정보 수집 · 이용에 동의해 주세요.';

/** 가입 가능한 가장 늦은 출생연도(★B: `birthYear ≤ 현재 연도 − 19`). 서비스도 같은 규칙으로 400 `AGE_NOT_ALLOWED`를 낸다. */
export const MAX_SIGNUP_BIRTH_YEAR = new Date().getFullYear() - SIGNUP_MIN_AGE;

/** W1 가입. 성별 미선택 · 만 19세 · 필수 동의를 화면에서 먼저 거른다. */
export const SignupFormSchema = SignupRequestSchema.extend({
  gender: z.enum(GENDERS, { error: '성별을 선택해 주세요.' }),
  birthYear: BirthYearSchema.max(MAX_SIGNUP_BIRTH_YEAR, {
    error: AGE_NOT_ALLOWED_MESSAGE,
  }),
  consents: z.strictObject({
    privacy: z
      .boolean()
      .refine((value) => value, { error: PRIVACY_CONSENT_MESSAGE }),
    marketing: z.boolean(),
  }),
});
export type SignupFormInput = z.input<typeof SignupFormSchema>;
export type SignupFormOutput = z.output<typeof SignupFormSchema>;

/** W2 로그인. `client`는 api-client가 채운다. */
export const LoginFormSchema = LoginRequestSchema.omit({ client: true });
export type LoginFormInput = z.input<typeof LoginFormSchema>;
export type LoginFormOutput = z.output<typeof LoginFormSchema>;

/**
 * W4 프로필 수정. 휴대폰 · 마케팅 수신 동의만 바꿀 수 있고, 휴대폰을 바꾸면 현재 비밀번호가 필요하다(D9).
 * 원래 값과 비교해야 하므로 프로필로 만든다.
 */
export function createProfileEditSchema(current: MemberProfile) {
  return z
    .strictObject({
      phone: PhoneSchema,
      marketingConsent: z.boolean(),
      currentPassword: z
        .string()
        .max(PASSWORD_MAX_LENGTH, { error: '비밀번호가 너무 깁니다.' }),
    })
    .refine(
      (value) =>
        value.phone === current.phone || value.currentPassword.length > 0,
      {
        error: '휴대폰 번호를 바꾸려면 현재 비밀번호를 입력해 주세요.',
        path: ['currentPassword'],
      },
    );
}
export type ProfileEditSchema = ReturnType<typeof createProfileEditSchema>;
export type ProfileEditInput = z.input<ProfileEditSchema>;
export type ProfileEditOutput = z.output<ProfileEditSchema>;

/** 바뀐 필드만 담은 `PATCH /members/me` 본문. 아무것도 바뀌지 않았으면 null. */
export function toUpdateMyProfileRequest(
  values: ProfileEditOutput,
  current: MemberProfile,
): UpdateMyProfileRequest | null {
  const request: UpdateMyProfileRequest = {};
  if (values.phone !== current.phone) {
    request.phone = values.phone;
    request.currentPassword = values.currentPassword;
  }
  if (values.marketingConsent !== current.marketingConsent) {
    request.marketingConsent = values.marketingConsent;
  }
  return Object.keys(request).length === 0 ? null : request;
}

/** W5 비밀번호 변경. 새 비밀번호 확인 일치는 화면에서만 검사한다. */
export const PasswordChangeFormSchema = ChangePasswordRequestSchema.extend({
  newPasswordConfirm: z
    .string({ error: '새 비밀번호를 한 번 더 입력해 주세요.' })
    .min(1, { error: '새 비밀번호를 한 번 더 입력해 주세요.' }),
}).refine((value) => value.newPassword === value.newPasswordConfirm, {
  error: '새 비밀번호가 서로 다릅니다.',
  path: ['newPasswordConfirm'],
});
export type PasswordChangeInput = z.input<typeof PasswordChangeFormSchema>;
export type PasswordChangeOutput = z.output<typeof PasswordChangeFormSchema>;

/** W6 탈퇴 확인. */
export const WithdrawFormSchema = WithdrawRequestSchema;
export type WithdrawFormInput = z.input<typeof WithdrawFormSchema>;
export type WithdrawFormOutput = z.output<typeof WithdrawFormSchema>;
