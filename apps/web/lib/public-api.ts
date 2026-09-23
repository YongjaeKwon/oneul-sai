import 'server-only';

import { ApiClient } from '@oneul-sai/api-client';
import {
  ScheduleIdSchema,
  type PublicSchedule,
  type PublicScheduleListResponse,
} from '@oneul-sai/contracts';
import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';

import { normalizePage } from '@/lib/format';

/**
 * 서버 컴포넌트의 공개 일정 조회(SPEC-002 7절 "web 서버 렌더용 모듈" · D11). 이 두 함수만 내보낸다.
 *
 * - 토큰이 필요 없는 `@Public` 조회뿐이다. 보호 데이터는 여전히 클라이언트 컴포넌트에서만 부른다(ADR-009 결정 5).
 * - `client` 없이 만든 인스턴스를 모듈 안에만 둔다 — 토큰 저장소가 방문자 사이에 섞일 경로가 없다.
 *   api-client의 두 공개 메서드는 항상 `auth: false`라 `Authorization`을 붙이지 않는다.
 * - 캐시는 함수 단위(`unstable_cache`, 키 = 함수 이름 + `page` 또는 `id`, 30초). `fetch`의 `next.revalidate`는
 *   api-client가 호출마다 붙이는 무작위 `x-request-id`가 키에 들어가 적중하지 않는다. 실패(4xx · 5xx)는 캐시하지 않는다.
 * - `NEXT_PUBLIC_API_URL`을 서버에서도 쓴다(새 env 없음). 빌드 시점에 인라인된다.
 */
const client = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
});

const REVALIDATE_SECONDS = 30;

const cachedList = unstable_cache(
  (page: number) => client.listPublicEvents({ page }),
  ['listPublicEvents'],
  { revalidate: REVALIDATE_SECONDS },
);

const cachedGet = unstable_cache(
  (id: string) => client.getPublicEvent(id),
  ['getPublicEvent'],
  { revalidate: REVALIDATE_SECONDS },
);

/** `GET /api/v1/events?page=N`(20개씩). `page`는 [1, PAGE_MAX]로 고정한 뒤 캐시 키가 된다 — 키가 끝없이 늘지 않는다. */
export function listPublicEvents(
  page: unknown,
): Promise<PublicScheduleListResponse> {
  return cachedList(normalizePage(page));
}

/** `GET /api/v1/events/:id`. UUID가 아니면 API를 부르지 않고 404 화면(`notFound()`). */
export function getPublicEvent(id: string): Promise<PublicSchedule> {
  if (!ScheduleIdSchema.safeParse(id).success) {
    notFound();
  }
  return cachedGet(id);
}
