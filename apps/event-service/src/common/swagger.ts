import type { ApiHeaderOptions } from '@nestjs/swagger';
import {
  HEADER_INTERNAL_TOKEN,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
} from '@oneul-sai/contracts';

/** 컨트롤러가 같이 다는 Swagger 헤더 설명. Gateway가 채운다(서비스 포트를 직접 부를 때는 직접 넣는다). */
export const API_HEADERS = {
  internalToken: {
    name: HEADER_INTERNAL_TOKEN,
    required: true,
    description: 'Gateway ↔ 서비스 공유 비밀 (env INTERNAL_API_TOKEN)',
  },
  userId: {
    name: HEADER_USER_ID,
    required: true,
    description: 'Gateway가 채운 회원 ID',
  },
  userRole: {
    name: HEADER_USER_ROLE,
    required: true,
    description: 'ADMIN',
  },
} satisfies Record<string, ApiHeaderOptions>;
