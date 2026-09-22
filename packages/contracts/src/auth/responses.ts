import { z } from 'zod';

import { MemberProfileSchema } from '../member/profile.js';

/** login · refresh 응답. refresh token은 본문에 없고 `Set-Cookie`로만 온다(D3 · D4). */
export const AuthResponseSchema = z.object({
  /** access token(JWT HS256). `Authorization: Bearer`로 보낸다. */
  accessToken: z.string().min(1),
  /** access token 수명(초). 기본 900. */
  expiresIn: z.number().int().positive(),
  member: MemberProfileSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
