import {
  AdminPaymentListQuerySchema,
  CreatePaymentRequestSchema,
  UpdatePaymentStatusRequestSchema,
  type CreatePaymentRequest,
} from '@oneul-sai/contracts';

// SPEC-004 13절 단위: contracts에는 vitest가 없으므로 payment-service가 결제 스키마의 경계값을 검사한다.
// 에러 응답 message는 service-kit formatIssues(path · code만)가 만든다. 여기서는 그 재료인 Zod 이슈 전체에 입력값이 없는지 본다.

const body: CreatePaymentRequest = {
  applicationId: '3b241101-e2bb-4255-8caf-4136c566a962',
  memberId: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
  amount: 39_000,
};

const create = (overrides: Record<string, unknown>) =>
  CreatePaymentRequestSchema.safeParse({ ...body, ...overrides });

/** 실패해야 하고, 이슈(message 포함)에 입력값이 없어야 한다. */
function expectRejected(
  result: { success: true } | { success: false; error: { issues: unknown } },
  input?: string,
): void {
  expect(result.success).toBe(false);
  if (input !== undefined && !result.success) {
    expect(JSON.stringify(result.error.issues)).not.toContain(input);
  }
}

describe('CreatePaymentRequest (★E)', () => {
  it('rejects amount -1 · 1,000,001 · 1.5 · a string', () => {
    for (const amount of [-1, 1_000_001, 1.5, '39000']) {
      expectRejected(create({ amount }));
    }
  });

  it('accepts amount 0 · 1,000,000 (0원 신청도 기록한다)', () => {
    expect(create({ amount: 0 }).success).toBe(true);
    expect(create({ amount: 1_000_000 }).success).toBe(true);
  });

  it.each([
    ['status', 'COMPLETED'],
    ['recordedBy', '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'],
    ['scheduleId', '3b241101-e2bb-4255-8caf-4136c566a962'],
  ])('rejects the unknown field %s', (key, value) => {
    expectRejected(create({ [key]: value }));
  });

  it.each([['applicationId'], ['memberId']])(
    'rejects a non-UUID %s without echoing it',
    (key) => {
      expectRejected(create({ [key]: 'not-a-uuid' }), 'not-a-uuid');
    },
  );
});

describe('UpdatePaymentStatusRequest', () => {
  it('accepts REFUNDED with a refundAmount', () => {
    expect(
      UpdatePaymentStatusRequestSchema.safeParse({
        status: 'REFUNDED',
        refundAmount: 39_000,
      }).success,
    ).toBe(true);
    expect(
      UpdatePaymentStatusRequestSchema.safeParse({
        status: 'REFUNDED',
        refundAmount: 0,
      }).success,
    ).toBe(true);
  });

  it('rejects COMPLETED, an empty body, a missing or out-of-range refundAmount and unknown fields', () => {
    for (const input of [
      {},
      { status: 'COMPLETED', refundAmount: 0 },
      { status: 'REFUNDED' },
      { status: 'REFUNDED', refundAmount: -1 },
      { status: 'REFUNDED', refundAmount: 1_000_001 },
      { status: 'REFUNDED', refundAmount: 1.5 },
      { status: 'REFUNDED', refundAmount: 0, reason: 'x' },
    ]) {
      expectRejected(UpdatePaymentStatusRequestSchema.safeParse(input));
    }
  });
});

describe('AdminPaymentListQuery.applicationIds (MemberListQuery.ids와 같은 규칙)', () => {
  const uuid = (n: number) =>
    `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
  const ids = (count: number) =>
    Array.from({ length: count }, (_, index) => uuid(index)).join(',');

  it('accepts 1 and 100 ids and splits them', () => {
    expect(
      AdminPaymentListQuerySchema.parse({ applicationIds: uuid(1) })
        .applicationIds,
    ).toEqual([uuid(1)]);
    expect(
      AdminPaymentListQuerySchema.parse({ applicationIds: ids(100) })
        .applicationIds,
    ).toHaveLength(100);
  });

  it('rejects a non-UUID item without echoing it', () => {
    // 이슈는 조각마다 생기므로(path ['applicationIds', i]) 이은 값이 아니라 잘못된 조각을 찾는다.
    expectRejected(
      AdminPaymentListQuerySchema.safeParse({
        applicationIds: `${uuid(1)},not-a-uuid`,
      }),
      'not-a-uuid',
    );
  });

  it('rejects 101 ids, an empty string, an empty item and a missing value', () => {
    for (const value of [ids(101), '', `${uuid(1)},,${uuid(2)}`]) {
      expectRejected(
        AdminPaymentListQuerySchema.safeParse({ applicationIds: value }),
      );
    }
    expectRejected(AdminPaymentListQuerySchema.safeParse({}));
  });

  it('reports one issue for a long run of commas (count first)', () => {
    const result = AdminPaymentListQuerySchema.safeParse({
      applicationIds: ','.repeat(500),
    });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues).toHaveLength(1);
  });

  it('rejects page fields and other unknown keys', () => {
    for (const extra of [
      { page: '1' },
      { pageSize: '100' },
      { ids: uuid(1) },
    ]) {
      expectRejected(
        AdminPaymentListQuerySchema.safeParse({
          applicationIds: uuid(1),
          ...extra,
        }),
      );
    }
  });
});
