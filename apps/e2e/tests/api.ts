import { randomUUID } from 'node:crypto';

import {
  APPLICATION_PATHS,
  AUTH_PATHS,
  MEETUP_PATHS,
  MEMBER_PATHS,
} from '@oneul-sai/api-client';
import type {
  AdminSchedule,
  AuthResponse,
  CreateScheduleRequest,
  Gender,
  Meetup,
  MyApplication,
  SignupRequest,
} from '@oneul-sai/contracts';

import { env } from '../env.js';

// 준비(가입 · 상품 · 회차 · 공개 · 신청)는 화면이 아니라 Gateway API로 한다(SPEC-003 13절).
// 테스트마다 새 회원(고유 이메일)과 새 회차를 만들어 기존 데이터에 기대지 않는다.

async function call<T>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; origin?: string } = {},
): Promise<T> {
  const response = await fetch(`${env.E2E_API_URL}${path}`, {
    method,
    headers: {
      ...(options.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(options.token === undefined
        ? {}
        : { Authorization: `Bearer ${options.token}` }),
      ...(options.origin === undefined ? {} : { Origin: options.origin }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    throw new Error(
      `${method} ${path} → ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

/** 운영자 로그인(`client: 'ADMIN'`은 `Origin`이 운영자 웹 주소여야 한다 — SPEC-001). */
export async function adminToken(): Promise<string> {
  const auth = await call<AuthResponse>('POST', AUTH_PATHS.login, {
    body: {
      email: env.E2E_ADMIN_EMAIL,
      password: env.E2E_ADMIN_PASSWORD,
      client: 'ADMIN',
    },
    origin: env.E2E_ADMIN_URL,
  });
  return auth.accessToken;
}

export interface TestSchedule {
  meetup: Meetup;
  schedule: AdminSchedule;
}

/** 서울 날짜 `YYYY-MM-DD` — n일 뒤. */
function seoulDate(daysAhead: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(
    new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000),
  );
}

/** 모집 중인 회차(OPEN, 신청 마감은 일주일 뒤). 참가비는 남녀를 달리해 화면의 금액이 성별 스냅샷인지 드러나게 한다. */
export async function openSchedule(token: string): Promise<TestSchedule> {
  const meetup = await call<Meetup>('POST', MEETUP_PATHS.meetups, {
    token,
    body: { title: `e2e 일요일 소개팅 ${randomUUID().slice(0, 8)}` },
  });
  // 날짜는 한 번만 읽는다 — 세 시각이 서울 자정을 사이에 두고 다른 날로 갈리지 않게
  const day = seoulDate(7);
  const at = (hour: number) =>
    `${day}T${String(hour).padStart(2, '0')}:00:00+09:00`;
  const request: CreateScheduleRequest = {
    startsAt: at(14),
    endsAt: at(16),
    applyDeadlineAt: at(13),
    priceMale: 30_000,
    priceFemale: 25_000,
    capacityMale: 7,
    capacityFemale: 7,
    maleMinBirthYear: null,
    maleMaxBirthYear: null,
    venueArea: '성수',
    venueName: null,
    venueAddress: null,
    venueDirections: null,
    venueMapUrl: null,
  };
  const draft = await call<AdminSchedule>(
    'POST',
    MEETUP_PATHS.schedules(meetup.id),
    { token, body: request },
  );
  const schedule = await call<AdminSchedule>(
    'PATCH',
    MEETUP_PATHS.scheduleStatus(meetup.id, draft.id),
    { token, body: { status: 'OPEN' } },
  );
  return { meetup, schedule };
}

export interface TestMember {
  email: string;
  password: string;
  name: string;
  gender: Gender;
  /** 숫자 11자리 — 운영자 목록(A10)에 `010-XXXX-XXXX`로 보인다. */
  phone: string;
}

/** 새 회원 가입(고유 이메일). 이름은 운영자 목록 · 확인 창에서 찾을 수 있게 겹치지 않게 만든다. */
export async function signupMember(gender: Gender): Promise<TestMember> {
  const suffix = randomUUID().slice(0, 8);
  const member: TestMember = {
    email: `e2e-${suffix}@example.com`,
    password: `e2e-password-${suffix}`,
    name: `테스트${suffix.slice(0, 4)}`,
    gender,
    phone: `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
  };
  const request: SignupRequest = {
    email: member.email,
    password: member.password,
    name: member.name,
    gender,
    birthYear: 1995,
    phone: member.phone,
    consents: { privacy: true, marketing: false },
  };
  await call('POST', MEMBER_PATHS.members, { body: request });
  return member;
}

/** 회원으로 로그인해 신청한다(운영자 흐름의 준비). */
export async function applyAs(
  member: TestMember,
  scheduleId: string,
): Promise<MyApplication> {
  const auth = await call<AuthResponse>('POST', AUTH_PATHS.login, {
    body: { email: member.email, password: member.password, client: 'WEB' },
  });
  return call<MyApplication>('POST', APPLICATION_PATHS.applications, {
    token: auth.accessToken,
    body: { scheduleId },
  });
}
