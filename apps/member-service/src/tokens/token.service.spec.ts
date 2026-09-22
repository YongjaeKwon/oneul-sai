import { JWT_AUDIENCE, JWT_ISSUER, JWT_TYP } from '@oneul-sai/contracts';
import { decodeProtectedHeader, jwtVerify } from 'jose';
import { vi } from 'vitest';
import type { RefreshToken } from '../generated/prisma/client.js';
import {
  decodeAccessSecret,
  generateRefreshToken,
  hashRefreshToken,
  TokenService,
  type TokenTx,
} from './token.service.js';

const SECRET_B64 = Buffer.alloc(32, 9).toString('base64');
const NOW = new Date('2026-09-22T10:00:00.000Z');
const MEMBER_ID = '2f7a1c1e-6c3f-4b2a-9d1e-5b6c7d8e9f01';

function service(now = NOW) {
  return new TokenService({
    secret: decodeAccessSecret(SECRET_B64),
    accessTtlSeconds: 900,
    refreshTtlSeconds: 2_592_000,
    now: () => now,
  });
}

function row(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'row-1',
    memberId: MEMBER_ID,
    familyId: 'fam-1',
    familyStartedAt: new Date(NOW.getTime() - 60_000),
    client: 'WEB',
    tokenHash: 'hash',
    status: 'ACTIVE',
    expiresAt: new Date(NOW.getTime() + 60_000),
    rotatedAt: null,
    revokedAt: null,
    revokedReason: null,
    createdAt: NOW,
    ...overrides,
  };
}

function fakeTx(overrides: Record<string, unknown> = {}) {
  const tx = {
    $queryRaw: vi.fn(async () => []),
    refreshToken: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
      groupBy: vi.fn(async () => []),
      ...overrides,
    },
  };
  return { tx, as: tx as unknown as TokenTx };
}

describe('TokenService', () => {
  it('signs an HS256 access token with sub, role, iss, aud, typ and exp = iat + TTL', async () => {
    const token = await service().signAccessToken(MEMBER_ID, 'ADMIN');

    expect(decodeProtectedHeader(token)).toEqual({
      alg: 'HS256',
      typ: JWT_TYP,
    });
    const { payload } = await jwtVerify(token, decodeAccessSecret(SECRET_B64), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      typ: JWT_TYP,
      currentDate: NOW,
    });
    expect(payload.sub).toBe(MEMBER_ID);
    expect(payload.role).toBe('ADMIN');
    expect(payload.iat).toBe(Math.floor(NOW.getTime() / 1000));
    expect(payload.exp).toBe((payload.iat ?? 0) + 900);
  });

  it('makes 43-character base64url refresh tokens and 64-hex SHA-256 hashes', () => {
    const token = generateRefreshToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(generateRefreshToken()).not.toBe(token);
  });

  it('judges the grace window (60s) and expiry (expiresAt or familyStartedAt + 90 days)', () => {
    const s = service();
    expect(
      s.isWithinGrace(row({ rotatedAt: new Date(NOW.getTime() - 30_000) })),
    ).toBe(true);
    expect(
      s.isWithinGrace(row({ rotatedAt: new Date(NOW.getTime() - 61_000) })),
    ).toBe(false);
    expect(s.isWithinGrace(row({ rotatedAt: null }))).toBe(false);

    expect(s.isExpired(row())).toBe(false);
    expect(s.isExpired(row({ expiresAt: new Date(NOW.getTime() - 1) }))).toBe(
      true,
    );
    const days91 = new Date(NOW.getTime() - 91 * 24 * 60 * 60 * 1000);
    expect(s.isExpired(row({ familyStartedAt: days91 }))).toBe(true);
  });

  it('locks the row with SELECT ... FOR UPDATE by hash before reading it', async () => {
    const { tx, as } = fakeTx({
      findUnique: vi.fn(async () => row()),
    });
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'row-1' }] as never);

    const found = await service().lockByToken(as, 'raw-token');

    expect(found?.id).toBe('row-1');
    const [strings, hash] = tx.$queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join('?')).toContain('FOR UPDATE');
    expect(hash).toBe(hashRefreshToken('raw-token'));
    expect(tx.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { id: 'row-1' },
    });

    const { as: emptyTx, tx: empty } = fakeTx();
    expect(await service().lockByToken(emptyTx, 'other')).toBeNull();
    expect(empty.refreshToken.findUnique).not.toHaveBeenCalled();
  });

  it('issues a new family and rotates within the same family', async () => {
    const { tx, as } = fakeTx();
    const s = service();

    const issued = await s.issueFamily(as, {
      memberId: MEMBER_ID,
      client: 'ADMIN',
    });
    expect(issued.token).toHaveLength(43);
    expect(tx.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        memberId: MEMBER_ID,
        familyId: issued.familyId,
        familyStartedAt: NOW,
        client: 'ADMIN',
        tokenHash: hashRefreshToken(issued.token),
        status: 'ACTIVE',
        expiresAt: new Date(NOW.getTime() + 2_592_000_000),
      }),
    });

    const current = row();
    const rotated = await s.rotate(as, current);
    expect(tx.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: { status: 'ROTATED', rotatedAt: NOW },
    });
    expect(tx.refreshToken.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        familyId: 'fam-1',
        familyStartedAt: current.familyStartedAt,
        client: 'WEB',
        tokenHash: hashRefreshToken(rotated.token),
        status: 'ACTIVE',
      }),
    });
  });

  it('revokes families with the given reason and honors the family cap of 10', async () => {
    const families = Array.from({ length: 11 }, (_, i) => ({
      familyId: `fam-${i}`,
      _min: { familyStartedAt: new Date(NOW.getTime() - (11 - i) * 1000) },
    }));
    const { tx, as } = fakeTx({
      groupBy: vi.fn(async () => families),
      findMany: vi.fn(async () => [{ familyId: 'a' }, { familyId: 'b' }]),
      updateMany: vi.fn(async () => ({ count: 3 })),
    });
    const s = service();

    expect(await s.enforceFamilyLimit(as, MEMBER_ID)).toBe(1);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam-0', status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: NOW, revokedReason: 'LIMIT' },
    });

    const all = await s.revokeAllForMember(as, MEMBER_ID, 'PASSWORD_CHANGED', {
      exceptFamilyIds: ['keep'],
    });
    expect(all).toEqual({ families: 2, tokens: 3 });
    expect(tx.refreshToken.updateMany).toHaveBeenLastCalledWith({
      where: {
        memberId: MEMBER_ID,
        status: 'ACTIVE',
        familyId: { notIn: ['keep'] },
      },
      data: {
        status: 'REVOKED',
        revokedAt: NOW,
        revokedReason: 'PASSWORD_CHANGED',
      },
    });
  });

  it('revokePresentedFamily only acts on an ACTIVE token of the same client', async () => {
    const { tx, as } = fakeTx({
      findUnique: vi.fn(async () => row({ client: 'ADMIN' })),
    });
    tx.$queryRaw.mockResolvedValue([{ id: 'row-1' }] as never);
    const s = service();

    expect(await s.revokePresentedFamily(as, 'raw', 'WEB', 'RELOGIN')).toBe(
      false,
    );
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(await s.revokePresentedFamily(as, 'raw', 'ADMIN', 'RELOGIN')).toBe(
      true,
    );
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam-1', status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: NOW, revokedReason: 'RELOGIN' },
    });
  });
});
