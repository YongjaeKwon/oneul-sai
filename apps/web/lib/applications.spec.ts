import { ApiClientError } from '@oneul-sai/api-client';
import type { MyApplication } from '@oneul-sai/contracts';

import {
  applicationCard,
  applyAreaState,
  canCancelMine,
  depositAccountNote,
  describeApplicationError,
  type ApplyAreaSchedule,
} from './applications';

// SPEC-003(개정) 13절 단위 "web 표시 도우미" · SPEC-004 13절 — 참가 신청 영역의 판정 순서, 상태별 카드, 오류 문구.

const NOW = Date.parse('2026-10-01T00:00:00.000Z');
const DEADLINE = '2026-10-03T15:00:00.000Z';
const AFTER_DEADLINE = Date.parse(DEADLINE);

const schedule: ApplyAreaSchedule = {
  status: 'OPEN',
  applyDeadlineAt: DEADLINE,
  priceMale: 30_000,
  priceFemale: 25_000,
};

const man = { role: 'MEMBER', gender: 'MALE', birthYear: 1992 } as const;
const woman = { role: 'MEMBER', gender: 'FEMALE', birthYear: 1980 } as const;
const admin = { role: 'ADMIN', gender: null, birthYear: null } as const;

function application(overrides: Partial<MyApplication> = {}): MyApplication {
  return {
    id: '7a1d2c3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d',
    scheduleId: '1b2c3d4e-5f60-4718-9a0b-1c2d3e4f5a6b',
    status: 'APPLIED',
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

const applied = application();
const pending = application({ status: 'PENDING' });
const confirmed = application({ status: 'CONFIRMED' });
const cancelledByMember = application({
  status: 'CANCELLED',
  cancelledBy: 'MEMBER',
});
const cancelledByAdmin = application({
  status: 'CANCELLED',
  cancelledBy: 'ADMIN',
});
const cancelledBySchedule = application({
  status: 'CANCELLED',
  cancelledBy: 'SCHEDULE',
});

describe('applyAreaState — the first matching row of W9 (d)~(h)', () => {
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

  it.each([
    ['APPLIED', applied, true],
    ['PENDING', pending, true],
    ['CONFIRMED', confirmed, false],
  ])(
    '(e) my active %s application wins over closed recruitment',
    (_status, mine, cancellable) => {
      const closed = { ...schedule, status: 'CLOSED' } as const;
      expect(
        applyAreaState(closed, man, [mine, cancelledByMember], NOW),
      ).toEqual({ kind: 'applied', application: mine, cancellable });
    },
  );

  it('(e) a pending application is not cancellable from the deadline on; a received one still is', () => {
    expect(
      applyAreaState(schedule, man, [pending], AFTER_DEADLINE),
    ).toMatchObject({ kind: 'applied', cancellable: false });
    expect(
      applyAreaState(schedule, man, [applied], AFTER_DEADLINE),
    ).toMatchObject({ kind: 'applied', cancellable: true });
  });

  it('(e) an old admin-cancelled row next to a new active row (J-2 revive) is still (e)', () => {
    expect(
      applyAreaState(schedule, man, [cancelledByAdmin, confirmed], NOW),
    ).toEqual({ kind: 'applied', application: confirmed, cancellable: false });
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
    expect(applyAreaState(schedule, man, [], AFTER_DEADLINE)).toEqual({
      kind: 'closed',
    });
  });

  it('(g) an application the operator cancelled blocks reapplying; my own or the schedule’s cancel does not', () => {
    expect(applyAreaState(schedule, man, [cancelledByAdmin], NOW)).toEqual({
      kind: 'reapply-blocked',
    });
    expect(
      applyAreaState(
        schedule,
        man,
        [cancelledByMember, cancelledBySchedule],
        NOW,
      ),
    ).toEqual({ kind: 'apply', price: 30_000 });
  });

  it('(h) apply with my gender’s price — birth year and seats are not looked at (★S1 · ★S2)', () => {
    expect(
      applyAreaState(schedule, { ...man, birthYear: 1950 }, [], NOW),
    ).toEqual({ kind: 'apply', price: 30_000 });
    expect(applyAreaState(schedule, woman, [], NOW)).toEqual({
      kind: 'apply',
      price: 25_000,
    });
  });
});

describe('canCancelMine — the same table as the server decideCancel (D10)', () => {
  it('a received application: always, even past the deadline or when the schedule is closed (S3)', () => {
    const closed = application({
      schedule: { ...applied.schedule, status: 'CLOSED' },
    });
    expect(canCancelMine(applied, NOW)).toBe(true);
    expect(canCancelMine(applied, AFTER_DEADLINE)).toBe(true);
    expect(canCancelMine(closed, AFTER_DEADLINE)).toBe(true);
  });

  it('a pending application: until the deadline, even when the schedule is closed (C)', () => {
    const closed = application({
      status: 'PENDING',
      schedule: { ...applied.schedule, status: 'CLOSED' },
    });
    expect(canCancelMine(closed, NOW)).toBe(true);
    expect(canCancelMine(closed, AFTER_DEADLINE)).toBe(false);
  });

  it('a confirmed or cancelled application: never (★A)', () => {
    expect(canCancelMine(confirmed, NOW)).toBe(false);
    expect(canCancelMine(cancelledByMember, NOW)).toBe(false);
  });
});

describe('applicationCard — title · badge · note · cancel by status (SPEC-004 13절 목록 2 · 7)', () => {
  it('APPLIED: received title, neutral badge, "따로 안내", cancel button', () => {
    expect(applicationCard(applied, AFTER_DEADLINE)).toEqual({
      title: '참가 신청이 접수되었습니다.',
      label: '접수',
      tone: 'neutral',
      note: '참가 가능 여부는 따로 안내드릴게요.',
      cancellable: true,
      cancelBlocked: null,
    });
  });

  it('PENDING: received title, warning badge, deposit note, cancel button until the deadline', () => {
    expect(applicationCard(pending, NOW)).toEqual({
      title: '참가 신청이 접수되었습니다.',
      label: '입금 대기',
      tone: 'warning',
      note: '입금 확인 전입니다. 확인되면 알림톡으로 알려드릴게요.',
      cancellable: true,
      cancelBlocked: null,
    });
    expect(applicationCard(pending, AFTER_DEADLINE)).toMatchObject({
      cancellable: false,
      cancelBlocked:
        '신청 마감이 지나 취소할 수 없습니다. 오늘사이에 문의해 주세요.',
    });
  });

  it('CONFIRMED: confirmed title, success badge, venue note, ★A instead of the button — even before the deadline', () => {
    expect(applicationCard(confirmed, NOW)).toEqual({
      title: '입금이 확인되어 참가가 확정되었습니다.',
      label: '참가 확정',
      tone: 'success',
      note: '정확한 장소와 준비 사항은 행사 전에 다시 안내드릴게요.',
      cancellable: false,
      cancelBlocked:
        '참가가 확정된 신청은 직접 취소할 수 없습니다. 오늘사이에 문의해 주세요.',
    });
  });

  it.each([
    [cancelledByMember, '직접 취소했습니다.'],
    [cancelledByAdmin, '오늘사이에서 취소했습니다.'],
    [cancelledBySchedule, '일정이 취소되었습니다.'],
  ])(
    'CANCELLED by %o: danger badge, who cancelled, no button and no message',
    (mine, note) => {
      expect(applicationCard(mine, NOW)).toEqual({
        title: null,
        label: '취소',
        tone: 'danger',
        note,
        cancellable: false,
        cancelBlocked: null,
      });
    },
  );
});

describe('depositAccountNote (★D)', () => {
  const account = '오늘은행 123-456-789 (오늘사이)';

  it('shows the account only for a pending application with a fee and a configured value', () => {
    expect(depositAccountNote(pending, account)).toBe(
      '입금 계좌 오늘은행 123-456-789 (오늘사이)',
    );
  });

  it.each([
    ['received', applied, account],
    ['confirmed', confirmed, account],
    ['free (★E)', application({ status: 'PENDING', price: 0 }), account],
    ['no setting', pending, ''],
  ])('hides it when %s', (_why, mine, value) => {
    expect(depositAccountNote(mine, value)).toBeNull();
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

  it('maps application codes', () => {
    expect(describeApplicationError(error(409, 'APPLICATION_CLOSED'))).toBe(
      '모집이 마감되었습니다.',
    );
    expect(describeApplicationError(error(409, 'APPLICATION_CONFIRMED'))).toBe(
      '참가가 확정된 신청은 직접 취소할 수 없습니다. 오늘사이에 문의해 주세요.',
    );
    expect(
      describeApplicationError(error(409, 'APPLICATION_NOT_CANCELLABLE')),
    ).toBe('신청 마감이 지나 취소할 수 없습니다. 오늘사이에 문의해 주세요.');
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
