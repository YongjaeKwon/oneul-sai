import { API_ERROR_CODES } from '@oneul-sai/contracts';
import {
  decideApply,
  decideCancel,
  type ApplyFacts,
  type ApplySchedule,
} from './application-rules.js';

// SPEC-003 13절 단위: decideApply(D7 순서) · decideCancel(6절 취소 전이 표). 표와 코드를 한 곳에서 대조한다.

const DEADLINE = new Date('2026-10-04T05:00:00.000Z');
const BEFORE = new Date(DEADLINE.getTime() - 1);

const schedule = (overrides: Partial<ApplySchedule> = {}): ApplySchedule => ({
  status: 'OPEN',
  priceMale: 39_000,
  priceFemale: 29_000,
  applyDeadlineAt: DEADLINE,
  capacityMale: 7,
  capacityFemale: 7,
  maleMinBirthYear: null,
  maleMaxBirthYear: null,
  ...overrides,
});

const facts = (overrides: Partial<ApplyFacts> = {}): ApplyFacts => ({
  schedule: schedule(),
  now: BEFORE,
  applicant: { gender: 'MALE', birthYear: 1992 },
  hasActiveHere: false,
  adminCancelledHere: false,
  pendingElsewhere: 0,
  activeOfMyGender: 0,
  ...overrides,
});

const RANGE = { maleMinBirthYear: 1990, maleMaxBirthYear: 1995 };
const code = (result: ReturnType<typeof decideApply>) =>
  result.kind === 'reject' ? result.code : 'apply';

describe('decideApply (D7)', () => {
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
      'my active application here',
      { hasActiveHere: true },
      API_ERROR_CODES.ALREADY_APPLIED,
    ],
    [
      'an operator cancelled mine here',
      { adminCancelledHere: true },
      API_ERROR_CODES.REAPPLY_NOT_ALLOWED,
    ],
    ['only my own cancellation here', {}, 'apply'],
    [
      'a pending application elsewhere',
      { pendingElsewhere: 1 },
      API_ERROR_CODES.PENDING_APPLICATION_LIMIT,
    ],
    [
      'male born 1989, range 1990~1995',
      {
        schedule: schedule(RANGE),
        applicant: { gender: 'MALE', birthYear: 1989 },
      },
      API_ERROR_CODES.BIRTH_YEAR_OUT_OF_RANGE,
    ],
    [
      'male born 1996, range 1990~1995',
      {
        schedule: schedule(RANGE),
        applicant: { gender: 'MALE', birthYear: 1996 },
      },
      API_ERROR_CODES.BIRTH_YEAR_OUT_OF_RANGE,
    ],
    [
      'male born 1990 (lower edge)',
      {
        schedule: schedule(RANGE),
        applicant: { gender: 'MALE', birthYear: 1990 },
      },
      'apply',
    ],
    [
      'male born 1995 (upper edge)',
      {
        schedule: schedule(RANGE),
        applicant: { gender: 'MALE', birthYear: 1995 },
      },
      'apply',
    ],
    [
      'male born 1985, min only 1990',
      {
        schedule: schedule({ maleMinBirthYear: 1990 }),
        applicant: { gender: 'MALE', birthYear: 1985 },
      },
      API_ERROR_CODES.BIRTH_YEAR_OUT_OF_RANGE,
    ],
    [
      'male born 2000, max only 1995',
      {
        schedule: schedule({ maleMaxBirthYear: 1995 }),
        applicant: { gender: 'MALE', birthYear: 2000 },
      },
      API_ERROR_CODES.BIRTH_YEAR_OUT_OF_RANGE,
    ],
    [
      'male, no range',
      { applicant: { gender: 'MALE', birthYear: 1950 } },
      'apply',
    ],
    [
      'female outside the male range (no age check)',
      {
        schedule: schedule(RANGE),
        applicant: { gender: 'FEMALE', birthYear: 1970 },
      },
      'apply',
    ],
    ['male 7 of 7', { activeOfMyGender: 7 }, API_ERROR_CODES.SCHEDULE_FULL],
    ['male 6 of 7', { activeOfMyGender: 6 }, 'apply'],
    [
      'female 7 of 7',
      { applicant: { gender: 'FEMALE', birthYear: 1994 }, activeOfMyGender: 7 },
      API_ERROR_CODES.SCHEDULE_FULL,
    ],
    [
      'male with women full (capacity is per gender)',
      { schedule: schedule({ capacityFemale: 1 }), activeOfMyGender: 0 },
      'apply',
    ],
  ])('%s → %s', (_label, overrides, expected) => {
    expect(code(decideApply(facts(overrides)))).toBe(expected);
  });

  it.each<[string, Partial<ApplyFacts>, string]>([
    [
      'already applied + full',
      { hasActiveHere: true, activeOfMyGender: 7 },
      API_ERROR_CODES.ALREADY_APPLIED,
    ],
    [
      'pending limit + age',
      {
        pendingElsewhere: 1,
        schedule: schedule(RANGE),
        applicant: { gender: 'MALE', birthYear: 1980 },
      },
      API_ERROR_CODES.PENDING_APPLICATION_LIMIT,
    ],
    [
      'age + full',
      {
        schedule: schedule(RANGE),
        applicant: { gender: 'MALE', birthYear: 1980 },
        activeOfMyGender: 7,
      },
      API_ERROR_CODES.BIRTH_YEAR_OUT_OF_RANGE,
    ],
    [
      'closed + already applied',
      { now: DEADLINE, hasActiveHere: true },
      API_ERROR_CODES.APPLICATION_CLOSED,
    ],
  ])(
    'overlapping reasons: %s → the first in D7 order (%s)',
    (_label, overrides, expected) => {
      expect(code(decideApply(facts(overrides)))).toBe(expected);
    },
  );

  it('takes the price of the applicant gender (snapshot, D1)', () => {
    expect(decideApply(facts())).toEqual({ kind: 'apply', price: 39_000 });
    expect(
      decideApply(facts({ applicant: { gender: 'FEMALE', birthYear: 1994 } })),
    ).toEqual({ kind: 'apply', price: 29_000 });
  });

  it('answers 404 for missing schedules and 409 for the rest', () => {
    expect(decideApply(facts({ schedule: null }))).toMatchObject({
      status: 404,
    });
    expect(decideApply(facts({ activeOfMyGender: 7 }))).toMatchObject({
      status: 409,
    });
  });
});

describe('decideCancel (6절)', () => {
  const member = (now: Date) => ({ applyDeadlineAt: DEADLINE, now });
  it.each<[string, Parameters<typeof decideCancel>, string]>([
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
