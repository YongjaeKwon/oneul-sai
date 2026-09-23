import { randomUUID } from 'node:crypto';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import {
  DiscoveryService,
  MetadataScanner,
  ModulesContainer,
  Reflector,
} from '@nestjs/core';
import { API_ERROR_CODES } from '@oneul-sai/contracts';
import {
  INTERNAL_AUTH_EXEMPT_PATHS,
  IS_PUBLIC_KEY,
  ROLES_KEY,
} from '@oneul-sai/service-kit';
import {
  codeOf,
  MEMBER,
  scheduleInput,
  TestApp,
  type ApiCall,
} from './testing/integration-app.js';

// SPEC-002 13절 통합: 인가(401 · 403 · 내부 토큰 · 대소문자 경로 · /health · no-store)와 라우트 목록(기본 거부, 12절).

let t: TestApp;

beforeAll(async () => {
  t = await TestApp.start();
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const M = randomUUID();
const S = randomUUID();

/** `/api/v1/meetups/**`의 모든 운영자 핸들러. 역할 가드가 본문 검사보다 먼저이므로 본문은 빈 객체로 충분하다. */
const ADMIN_ENDPOINTS: Pick<ApiCall, 'method' | 'path' | 'body'>[] = [
  { method: 'GET', path: '/api/v1/meetups' },
  { method: 'POST', path: '/api/v1/meetups', body: {} },
  { method: 'GET', path: `/api/v1/meetups/${M}` },
  { method: 'PATCH', path: `/api/v1/meetups/${M}`, body: {} },
  { method: 'GET', path: `/api/v1/meetups/${M}/schedules` },
  { method: 'POST', path: `/api/v1/meetups/${M}/schedules`, body: {} },
  { method: 'POST', path: `/api/v1/meetups/${M}/schedules/batch`, body: {} },
  { method: 'GET', path: `/api/v1/meetups/${M}/schedules/${S}` },
  { method: 'PATCH', path: `/api/v1/meetups/${M}/schedules/${S}`, body: {} },
  {
    method: 'PATCH',
    path: `/api/v1/meetups/${M}/schedules/${S}/status`,
    body: {},
  },
  { method: 'DELETE', path: `/api/v1/meetups/${M}/schedules/${S}` },
];

describe('authorization (integration)', () => {
  it.each(ADMIN_ENDPOINTS)(
    '$method $path: no caller → 401 UNAUTHENTICATED, MEMBER → 403 FORBIDDEN',
    async (endpoint) => {
      const anonymous = await t.call(endpoint);
      expect(anonymous.status).toBe(401);
      expect(codeOf(anonymous)).toBe(API_ERROR_CODES.UNAUTHENTICATED);

      const member = await t.call({ ...endpoint, user: MEMBER });
      expect(member.status).toBe(403);
      expect(codeOf(member)).toBe(API_ERROR_CODES.FORBIDDEN);
    },
  );

  it.each([
    ['/api/v1/events'],
    [`/api/v1/events/${S}`],
    ['/api/v1/meetups'],
    ['/API/V1/events'],
    ['/Api/v1/meetups'],
  ])(
    'GET %s without x-internal-token → 401 INTERNAL_TOKEN_INVALID',
    async (path) => {
      const result = await t.call({ method: 'GET', path, internalToken: null });
      expect(result.status).toBe(401);
      expect(codeOf(result)).toBe(API_ERROR_CODES.INTERNAL_TOKEN_INVALID);
    },
  );

  it('GET /health needs no internal token', async () => {
    const result = await t.call({
      method: 'GET',
      path: '/health',
      internalToken: null,
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('marks /meetups/** responses (200 · 201) Cache-Control: no-store, not public ones', async () => {
    const created = await t.admin('POST', '/api/v1/meetups', { title: '상품' });
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');

    const listed = await t.admin('GET', '/api/v1/meetups');
    expect(listed.status).toBe(200);
    expect(listed.headers.get('cache-control')).toBe('no-store');

    const meetupId = (created.body as { id: string }).id;
    const schedule = await t.admin(
      'POST',
      `/api/v1/meetups/${meetupId}/schedules`,
      scheduleInput(),
    );
    expect(schedule.headers.get('cache-control')).toBe('no-store');

    const events = await t.call({ method: 'GET', path: '/api/v1/events' });
    expect(events.status).toBe(200);
    expect(events.headers.get('cache-control')).not.toBe('no-store');
  });
});

describe('route list — default deny (integration, 12절)', () => {
  interface Route {
    method: RequestMethod;
    path: string;
    isPublic: boolean;
    roles: unknown;
  }

  function routes(): Route[] {
    const reflector = t.app.get(Reflector);
    const discovery = new DiscoveryService(t.app.get(ModulesContainer));
    const scanner = new MetadataScanner();
    const found: Route[] = [];
    for (const wrapper of discovery.getControllers()) {
      const controller = wrapper.metatype;
      const instance = wrapper.instance as Record<string, unknown> | undefined;
      if (typeof controller !== 'function' || instance === undefined) continue;
      const base = reflector.get<string>(PATH_METADATA, controller);
      for (const name of scanner.getAllMethodNames(
        Object.getPrototypeOf(instance) as object,
      )) {
        const handler = instance[name] as (...args: unknown[]) => unknown;
        const method = reflector.get<RequestMethod | undefined>(
          METHOD_METADATA,
          handler,
        );
        if (method === undefined) continue;
        const sub = reflector.get<string>(PATH_METADATA, handler);
        const path = `/${[base, sub]
          .map((part) => part.replace(/^\/+|\/+$/g, ''))
          .filter((part) => part.length > 0)
          .join('/')}`;
        found.push({
          method,
          path,
          isPublic:
            reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
              handler,
              controller,
            ]) === true,
          roles: reflector.getAllAndOverride<unknown>(ROLES_KEY, [
            handler,
            controller,
          ]),
        });
      }
    }
    return found;
  }

  const allowed = (route: Route): boolean =>
    // (a) 공개 GET, /api/v1/events 아래
    (route.isPublic &&
      route.method === RequestMethod.GET &&
      (route.path === '/api/v1/events' ||
        route.path.startsWith('/api/v1/events/'))) ||
    // (b) ADMIN 전용이고 공개가 아님
    (!route.isPublic &&
      JSON.stringify(route.roles) === JSON.stringify(['ADMIN'])) ||
    // (c) 내부 토큰 예외 경로(/health)
    INTERNAL_AUTH_EXEMPT_PATHS.includes(route.path);

  it('every registered handler is public-events GET, ADMIN-only, or /health', () => {
    const found = routes();
    // 공개 2 + 상품 4 + 회차 7 + health 1 — 열거가 실제로 핸들러를 찾는지도 확인한다
    expect(found).toHaveLength(14);
    const violations = found
      .filter((route) => !allowed(route))
      .map((route) => `${RequestMethod[route.method]} ${route.path}`);
    expect(violations).toEqual([]);
  });

  it('would reject a handler without @Roles under /api/v1/meetups', () => {
    expect(
      allowed({
        method: RequestMethod.GET,
        path: '/api/v1/meetups/new-thing',
        isPublic: false,
        roles: undefined,
      }),
    ).toBe(false);
  });
});
