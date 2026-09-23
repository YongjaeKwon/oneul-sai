import type { PipeTransform } from '@nestjs/common';
import { API_ERROR_CODES } from '@oneul-sai/contracts';
import type { z } from '@oneul-sai/config';
import { apiError } from './api-error.js';

// SPEC-001 7절 공통 규칙: 400 `VALIDATION_FAILED`, message는 `issue.path` · `issue.code`만으로 만든 고정 문구.
// Zod 기본 메시지는 입력값(`received 'x'`)을 되돌려 주므로 쓰지 않는다 (12절).

const CODE_LABEL: Record<string, string> = {
  invalid_type: '타입',
  too_small: '범위',
  too_big: '범위',
  invalid_format: '형식',
  invalid_value: '값',
  not_multiple_of: '범위',
  unrecognized_keys: '모르는 필드',
  invalid_union: '형식',
  invalid_key: '형식',
  invalid_element: '형식',
  custom: '규칙',
};

export function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.map(String).join('.');
      return `${path.length > 0 ? path : 'body'}: ${CODE_LABEL[issue.code] ?? '오류'}`;
    })
    .join(', ');
}

export class ZodValidationPipe<TOutput> implements PipeTransform<
  unknown,
  TOutput
> {
  constructor(private readonly schema: z.ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw apiError(
        400,
        API_ERROR_CODES.VALIDATION_FAILED,
        formatIssues(result.error.issues),
      );
    }
    return result.data;
  }
}
