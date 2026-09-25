import { ApiClientError } from '@oneul-sai/api-client';
import type { MyApplication } from '@oneul-sai/contracts';

import {
  applicationErrorCopy,
  applyAreaState,
  birthYearRuleMessage,
  canCancelMine,
  describeApplicationError,
  type ApplyAreaSchedule,
} from './applications';

// SPEC-003 13절 단위 "web 표시 도우미" — 참가 신청 영역의 판정 순서와 오류 문구.

const NOW = Date.parse('2026-10-01T00:00:00.000Z');
const DEADLINE = '2026-10-03T15:00:00.000Z';

const schedule: ApplyAreaSchedule = {
  status: 'OPEN',
  applyDeadlineAt: DEADLINE,
  priceMale: 30_000,
  priceFemale: 25_000,
  maleMinBirthYear: 1990,
  maleMaxBirthYear: 1995,
  maleFull: false,
  femaleFull: false,
};

const man = { role: 'MEMBER', gender: 'MALE', birthYear: 1992 } as const;
const woman = { role: 'MEMBER', gender: 'FEMALE', birthYear: 1980 } as const;
const admin = { role: 'ADMIN', gender: null, birthYear: null } as const;

function application(overrides: Partial<MyApplication> = {}): MyApplication {
  return {
    id: '7a1d2c3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d',
    scheduleId: '1b2c3d4e-5f60-4718-9a0b-1c2d3e4f5a6b',
    status: 'PENDING',
    cancelledBy: null,
    price: 30_000,
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
    schedule: {
      title: '일요일 오후',
      startsAt: '2026-10-04T05:00:00.000Z',
      endsAt: '2026-10-04T07:30:00.000Z',
      applyDeadlineAt: DEADLINE,
      venueArea: '성수',
      status: 'OPEN',
    },
    ...overrides,
  };
}

const cancelledByMember = application({
  status: 'CANCELLED',
  cancelledBy: 'MEMBER',
});
const cancelledByAdmin = application({
  status: 'CANCELLED',
  cancelledBy: 'ADMIN',
});

describe('applyAreaState — the first matching row of W9 (d)~(j)', () => {
  it('(d) an admin account never applies, and its applications are not needed', () => {
    expect(applyAreaState(schedule, admin, undefined, NOW)).toEqual({
      kind: 'admin',
    });
  });

  it('waits for my applications before deciding', () => {
    expect(applyAreaState(schedule, man, undefined, NOW)).toEqual({
      kind: 'loading',
    });
  });

  it('(e) my pending application wins over closed recruitment and a full gender', () => {
    const pending = application();
    const closedAndFull = {
      ...schedule,
      status: 'CLOSED',
      maleFull: true,
    } as const;
    expect(
      applyAreaState(closedAndFull, man, [pending, cancelledByMember], NOW),
    ).toEqual({ kind: 'applied', application: pending, cancellable: true });
  });

  it('(e) is not cancellable from the deadline on', () => {
    const state = applyAreaState(
      schedule,
      man,
      [application()],
      Date.parse(DEADLINE),
    );
    expect(state).toMatchObject({ kind: 'applied', cancellable: false });
  });

  it('(f) closed by the operator or past the deadline, before admin-cancelled', () => {
    expect(
      applyAreaState(
        { ...schedule, status: 'CLOSED' },
        man,
        [cancelledByAdmin],
        NOW,
      ),
    ).toEqual({ kind: 'closed' });
    expect(applyAreaState(schedule, man, [], Date.parse(DEADLINE))).toEqual({
      kind: 'closed',
    });
  });

  it('(g) an application the operator cancelled blocks reapplying; my own cancel does not', () => {
    expect(applyAreaState(schedule, man, [cancelledByAdmin], NOW)).toEqual({
      kind: 'reapply-blocked',
    });
    expect(applyAreaState(schedule, man, [cancelledByMember], NOW)).toEqual({
      kind: 'apply',
      price: 30_000,
    });
  });

  it('(h) a man outside the birth years, checked before a full gender (D7)', () => {
    const full = { ...schedule, maleFull: true };
    for (const birthYear of [1989, 1996]) {
      expect(applyAreaState(full, { ...man, birthYear }, [], NOW)).toEqual({
        kind: 'birth-year',
      });
    }
    for (const birthYear of [1990, 1995]) {
      expect(applyAreaState(schedule, { ...man, birthYear }, [], NOW)).toEqual({
        kind: 'apply',
        price: 30_000,
      });
    }
  });

  it('(h) open-ended ranges and women are not limited', () => {
    const noMax = { ...schedule, maleMaxBirthYear: null };
    expect(
      applyAreaState(noMax, { ...man, birthYear: 2005 }, [], NOW),
    ).toMatchObject({
      kind: 'apply',
    });
    expect(applyAreaState(schedule, woman, [], NOW)).toEqual({
      kind: 'apply',
      price: 25_000,
    });
  });

  it('(g) an operator-cancelled application is checked before the birth years and a full gender', () => {
    const fullAndOld = { ...schedule, maleFull: true };
    expect(
      applyAreaState(
        fullAndOld,
        { ...man, birthYear: 1980 },
        [cancelledByAdmin],
        NOW,
      ),
    ).toEqual({ kind: 'reapply-blocked' });
  });

  it('(i) only my gender being full matters', () => {
    const menFull = { ...schedule, maleFull: true };
    expect(applyAreaState(menFull, man, [], NOW)).toEqual({
      kind: 'full',
      gender: 'MALE',
    });
    expect(applyAreaState(menFull, woman, [], NOW)).toEqual({
      kind: 'apply',
      price: 25_000,
    });
    const womenFull = { ...schedule, femaleFull: true };
    expect(applyAreaState(womenFull, woman, [], NOW)).toEqual({
      kind: 'full',
      gender: 'FEMALE',
    });
    expect(applyAreaState(womenFull, man, [], NOW)).toEqual({
      kind: 'apply',
      price: 30_000,
    });
  });
});

describe('applicationErrorCopy', () => {
  it('picks the full-seat copy by my gender, and none for an account without one', () => {
    expect(applicationErrorCopy('FEMALE')).toEqual({
      SCHEDULE_FULL: '여성 자리가 모두 찼습니다.',
    });
    expect(applicationErrorCopy(null)).toEqual({});
  });

  it('leaves 409 BIRTH_YEAR_OUT_OF_RANGE to the default copy — the button only gets it when the page is older than the operator’s change', () => {
    const ageError = new ApiClientError(409, {
      statusCode: 409,
      error: 'Conflict',
      code: 'BIRTH_YEAR_OUT_OF_RANGE',
      message: 'server text',
    });
    expect(
      describeApplicationError(ageError, applicationErrorCopy('MALE')),
    ).toBe('요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  });
});

describe('canCancelMine (C)', () => {
  it('allows a pending application until the deadline, even when the schedule is closed', () => {
    const closed = application({
      schedule: { ...application().schedule, status: 'CLOSED' },
    });
    expect(canCancelMine(closed, NOW)).toBe(true);
    expect(canCancelMine(closed, Date.parse(DEADLINE))).toBe(false);
    expect(canCancelMine(cancelledByMember, NOW)).toBe(false);
  });
});

describe('birthYearRuleMessage (SPEC-002 D5 표기)', () => {
  it.each([
    [1990, 1995, '이 일정은 남성 1990~1995년생만 신청하실 수 있습니다.'],
    [1990, null, '이 일정은 남성 1990년생부터만 신청하실 수 있습니다.'],
    [null, 1995, '이 일정은 남성 1995년생까지만 신청하실 수 있습니다.'],
  ])('%s ~ %s', (min, max, expected) => {
    expect(birthYearRuleMessage(min, max)).toBe(expected);
  });
});

describe('describeApplicationError (4절 오류 문구)', () => {
  const error = (status: number, code?: string) =>
    new ApiClientError(status, {
      statusCode: status,
      error: 'x',
      code,
      message: 'server text',
    });

  it('maps application codes, preferring the caller’s gender or age copy', () => {
    expect(describeApplicationError(error(409, 'APPLICATION_CLOSED'))).toBe(
      '모집이 마감되었습니다.',
    );
    expect(
      describeApplicationError(error(409, 'SCHEDULE_FULL'), {
        SCHEDULE_FULL: '여성 자리가 모두 찼습니다.',
      }),
    ).toBe('여성 자리가 모두 찼습니다.');
    expect(describeApplicationError(error(403, 'FORBIDDEN'))).toBe(
      '운영자 계정으로는 신청할 수 없습니다.',
    );
    expect(describeApplicationError(error(403, 'ACCOUNT_SUSPENDED'))).toBe(
      '이용이 정지된 계정입니다. 오늘사이에 문의해 주세요.',
    );
  });

  it('keeps the busy copy for 503 SERVICE_BUSY and one copy for other failures', () => {
    expect(describeApplicationError(error(503, 'SERVICE_BUSY'))).toBe(
      '지금 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    );
    const failed = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    expect(describeApplicationError(error(500, 'INTERNAL_ERROR'))).toBe(failed);
    expect(describeApplicationError(new TypeError('fetch failed'))).toBe(
      failed,
    );
  });
});
