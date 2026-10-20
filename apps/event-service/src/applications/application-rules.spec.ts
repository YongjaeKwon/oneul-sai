import { API_ERROR_CODES } from '@oneul-sai/contracts';
import {
  decideApply,
  decideCancel,
  decideInvite,
  type ApplyFacts,
  type ApplySchedule,
} from './application-rules.js';

// SPEC-003 13절 단위(개정 2026-10-14): decideApply(D15 순서 — 정원 · 연령 없음) · decideCancel(6절 취소 전이 표 + SPEC-004 D10) ·
// decideInvite(D16 — 참가 가능 안내). 표와 코드를 한 곳에서 대조한다.

const DEADLINE = new Date('2026-10-04T05:00:00.000Z');
const BEFORE = new Date(DEADLINE.getTime() - 1);

const schedule = (overrides: Partial<ApplySchedule> = {}): ApplySchedule => ({
  status: 'OPEN',
  priceMale: 39_000,
  priceFemale: 29_000,
  applyDeadlineAt: DEADLINE,
  ...overrides,
});

const facts = (overrides: Partial<ApplyFacts> = {}): ApplyFacts => ({
  schedule: schedule(),
  now: BEFORE,
  applicant: { gender: 'MALE' },
  hasActiveHere: false,
  adminCancelledHere: false,
  pendingElsewhere: 0,
  ...overrides,
});

const code = (result: ReturnType<typeof decideApply>) =>
  result.kind === 'reject' ? result.code : 'apply';

describe('decideApply (D15)', () => {
  it.each<[string, Partial<ApplyFacts>, string]>([
    ['no schedule', { schedule: null }, API_ERROR_CODES.SCHEDULE_NOT_FOUND],
    [
      'DRAFT',
      { schedule: schedule({ status: 'DRAFT' }) },
      API_ERROR_CODES.SCHEDULE_NOT_FOUND,
    ],
    [
      'CANCELLED',
      { schedule: schedule({ status: 'CANCELLED' }) },
      API_ERROR_CODES.SCHEDULE_NOT_FOUND,
    ],
    [
      'CLOSED',
      { schedule: schedule({ status: 'CLOSED' }) },
      API_ERROR_CODES.APPLICATION_CLOSED,
    ],
    [
      'OPEN at the deadline',
      { now: DEADLINE },
      API_ERROR_CODES.APPLICATION_CLOSED,
    ],
    ['OPEN 1ms before the deadline', {}, 'apply'],
    [
      'my active application here (APPLIED · PENDING · CONFIRMED alike)',
      { hasActiveHere: true },
      API_ERROR_CODES.ALREADY_APPLIED,
    ],
    [
      'an operator cancelled mine here (also at the APPLIED stage, S4)',
      { adminCancelledHere: true },
      API_ERROR_CODES.REAPPLY_NOT_ALLOWED,
    ],
    [
      'a pending (invited) application elsewhere',
      { pendingElsewhere: 1 },
      API_ERROR_CODES.PENDING_APPLICATION_LIMIT,
    ],
    [
      'a woman (no age or seat check either)',
      { applicant: { gender: 'FEMALE' } },
      'apply',
    ],
  ])('%s → %s', (_label, overrides, expected) => {
    expect(code(decideApply(facts(overrides)))).toBe(expected);
  });

  // 본인 취소 이력만 있는 경우는 ApplyFacts에 나타나지 않는다(hasActiveHere · adminCancelledHere 모두 false) —
  // 서비스 spec 'own cancelled rows only → a new application'이 덮는다.
  it('takes no seat count and no birth year — a full schedule or an age outside the range still receives (★S1 · D15)', () => {
    expectTypeOf<keyof ApplyFacts>().toEqualTypeOf<
      | 'schedule'
      | 'now'
      | 'applicant'
      | 'hasActiveHere'
      | 'adminCancelledHere'
      | 'pendingElsewhere'
    >();
    expectTypeOf<keyof ApplyFacts['applicant']>().toEqualTypeOf<'gender'>();
  });

  it.each<[string, Partial<ApplyFacts>, string]>([
    [
      'already applied + pending limit',
      { hasActiveHere: true, pendingElsewhere: 1 },
      API_ERROR_CODES.ALREADY_APPLIED,
    ],
    [
      'reapply blocked + pending limit',
      { adminCancelledHere: true, pendingElsewhere: 1 },
      API_ERROR_CODES.REAPPLY_NOT_ALLOWED,
    ],
    [
      'closed + already applied',
      { now: DEADLINE, hasActiveHere: true },
      API_ERROR_CODES.APPLICATION_CLOSED,
    ],
  ])(
    'overlapping reasons: %s → the first in D15 order (%s)',
    (_label, overrides, expected) => {
      expect(code(decideApply(facts(overrides)))).toBe(expected);
    },
  );

  it('takes the price of the applicant gender (snapshot, D1)', () => {
    expect(decideApply(facts())).toEqual({ kind: 'apply', price: 39_000 });
    expect(decideApply(facts({ applicant: { gender: 'FEMALE' } }))).toEqual({
      kind: 'apply',
      price: 29_000,
    });
  });

  it('answers 404 for missing schedules and 409 for the rest', () => {
    expect(decideApply(facts({ schedule: null }))).toMatchObject({
      status: 404,
    });
    expect(decideApply(facts({ pendingElsewhere: 1 }))).toMatchObject({
      status: 409,
    });
  });
});

describe('decideCancel (6절 · SPEC-004 D10)', () => {
  const member = (now: Date) => ({ applyDeadlineAt: DEADLINE, now });
  it.each<[string, Parameters<typeof decideCancel>, string]>([
    [
      'member · APPLIED · before the deadline',
      ['APPLIED', member(BEFORE)],
      'change',
    ],
    [
      'member · APPLIED · at the deadline (any time, S3)',
      ['APPLIED', member(DEADLINE)],
      'change',
    ],
    ['operator · APPLIED', ['APPLIED', null], 'change'],
    [
      'member · PENDING · 1ms before the deadline',
      ['PENDING', member(BEFORE)],
      'change',
    ],
    [
      'member · PENDING · at the deadline',
      ['PENDING', member(DEADLINE)],
      API_ERROR_CODES.APPLICATION_NOT_CANCELLABLE,
    ],
    ['operator · PENDING · any time', ['PENDING', null], 'change'],
    [
      'member · CONFIRMED · before the deadline',
      ['CONFIRMED', member(BEFORE)],
      API_ERROR_CODES.APPLICATION_CONFIRMED,
    ],
    [
      'member · CONFIRMED · at the deadline (confirmation is judged first)',
      ['CONFIRMED', member(DEADLINE)],
      API_ERROR_CODES.APPLICATION_CONFIRMED,
    ],
    ['operator · CONFIRMED', ['CONFIRMED', null], 'change'],
    [
      'member · CANCELLED (after the deadline too)',
      ['CANCELLED', member(DEADLINE)],
      'noop',
    ],
    ['operator · CANCELLED', ['CANCELLED', null], 'noop'],
  ])('%s → %s', (_label, args, expected) => {
    const result = decideCancel(...args);
    expect(result.kind === 'reject' ? result.code : result.kind).toBe(expected);
  });
});

describe('decideInvite (D16)', () => {
  it.each<[string, Parameters<typeof decideInvite>, string]>([
    ['APPLIED · 6 seated of 7', ['APPLIED', 6, 7], 'change'],
    [
      'APPLIED · 7 seated of 7',
      ['APPLIED', 7, 7],
      API_ERROR_CODES.SCHEDULE_FULL,
    ],
    ['APPLIED · 0 seated of 1', ['APPLIED', 0, 1], 'change'],
    [
      'APPLIED · 8 seated of 7 (capacity shrunk below the seated count)',
      ['APPLIED', 8, 7],
      API_ERROR_CODES.SCHEDULE_FULL,
    ],
    ['PENDING (already invited, even when full)', ['PENDING', 7, 7], 'noop'],
    [
      'CONFIRMED',
      ['CONFIRMED', 0, 7],
      API_ERROR_CODES.INVALID_STATUS_TRANSITION,
    ],
    [
      'CANCELLED (reviving is J-2)',
      ['CANCELLED', 0, 7],
      API_ERROR_CODES.INVALID_STATUS_TRANSITION,
    ],
  ])('%s → %s', (_label, args, expected) => {
    const result = decideInvite(...args);
    expect(result.kind === 'reject' ? result.code : result.kind).toBe(expected);
  });
});
