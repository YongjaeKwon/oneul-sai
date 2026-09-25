import { ScheduleIdSchema } from '@oneul-sai/contracts';

const EVENT_PREFIX = '/events/';

/**
 * 로그인 · 가입 뒤 돌아갈 주소(SPEC-003 4절 W9 (c), D12). `/events/<UUID>` 모양과 글자 그대로 맞을 때만 그 주소,
 * 아니면 null — 부르는 쪽이 `/me`로 보낸다. 열린 리디렉트(`//host`, `/\host`, `https:` …)는 이 모양 검사 하나로 막는다.
 */
export function eventNextPath(next: string | null | undefined): string | null {
  if (typeof next !== 'string' || !next.startsWith(EVENT_PREFIX)) {
    return null;
  }
  const id = next.slice(EVENT_PREFIX.length);
  return ScheduleIdSchema.safeParse(id).success ? next : null;
}

/** 로그인 ↔ 가입 화면을 오갈 때 `next`를 잇는 주소. 모양이 맞지 않으면 붙이지 않는다. */
export function withNext(
  path: '/login' | '/signup',
  next: string | null,
): string {
  return next === null ? path : `${path}?next=${next}`;
}
