import { z } from 'zod';

// SPEC-001 3절 '클라이언트 종류'. 앱용 값은 SPEC-005에서 추가한다(D3).
export const CLIENT_TYPES = ['WEB', 'ADMIN'] as const;
export const ClientTypeSchema = z.enum(CLIENT_TYPES);
export type ClientType = z.infer<typeof ClientTypeSchema>;
