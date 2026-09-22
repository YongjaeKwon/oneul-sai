import { z } from 'zod';

import {
  EmailSchema,
  PasswordInputSchema,
  PasswordSchema,
} from '../member/fields.js';
import { ClientTypeSchema } from './enums.js';

// SPEC-001 7절 인증 요청 스키마. 모두 strict.

/** `POST /api/v1/auth/login`. `client`가 쿠키 이름과 ADMIN 전용 로그인(403 `ROLE_NOT_ALLOWED`)을 정한다. */
export const LoginRequestSchema = z.strictObject({
  email: EmailSchema,
  password: PasswordInputSchema,
  client: ClientTypeSchema,
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * `POST /api/v1/auth/refresh` 본문(R1). 서비스는 `client`가 가리키는 쿠키(`onulsai_rt_web` 또는 `onulsai_rt_admin`)만 읽는다.
 * 한 브라우저에 두 쿠키가 함께 있어도 오류가 아니다. `ADMIN`이면 `Origin` 확인이 더해진다.
 */
export const RefreshRequestSchema = z.strictObject({
  client: ClientTypeSchema,
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

/** `POST /api/v1/auth/logout` 본문(R1). refresh와 같은 규칙으로 쿠키를 고른다. */
export const LogoutRequestSchema = z.strictObject({
  client: ClientTypeSchema,
});
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

/** `POST /api/v1/auth/password`. `newPassword`는 가입과 같은 규칙. */
export const ChangePasswordRequestSchema = z.strictObject({
  currentPassword: PasswordInputSchema,
  newPassword: PasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
