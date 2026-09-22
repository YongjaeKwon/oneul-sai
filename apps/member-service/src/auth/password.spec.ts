import {
  DUMMY_PASSWORD_HASH,
  SCRYPT_PARAMS,
  hashPassword,
  needsRehash,
  parsePasswordHash,
  verifyDummyPassword,
  verifyPassword,
} from './password.js';

// scrypt N=2^17은 호출당 100ms 이상 걸린다
const SCRYPT_TIMEOUT = 30_000;
const STORED_FORMAT =
  /^scrypt\$N=131072,r=8,p=1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/;

describe('password (scrypt)', () => {
  it(
    'hashes in the SPEC-001 storage format and verifies the same password',
    async () => {
      const stored = await hashPassword('correct horse battery');

      expect(stored).toMatch(STORED_FORMAT);
      await expect(
        verifyPassword('correct horse battery', stored),
      ).resolves.toBe(true);
      await expect(
        verifyPassword('correct horse batter', stored),
      ).resolves.toBe(false);
    },
    SCRYPT_TIMEOUT,
  );

  it(
    'uses a fresh random salt per hash',
    async () => {
      const a = await hashPassword('same-password');
      const b = await hashPassword('same-password');

      expect(a).not.toBe(b);
      expect(
        parsePasswordHash(a)?.salt.equals(parsePasswordHash(b)!.salt),
      ).toBe(false);
    },
    SCRYPT_TIMEOUT,
  );

  it('parses parameters, 16-byte salt and 64-byte key from the stored string', async () => {
    const parsed = parsePasswordHash(DUMMY_PASSWORD_HASH);

    expect(parsed?.params).toEqual(SCRYPT_PARAMS);
    expect(parsed?.salt.length).toBe(16);
    expect(parsed?.key.length).toBe(64);
  });

  it('returns null for values that are not in the stored format', () => {
    expect(parsePasswordHash('withdrawn')).toBeNull();
    expect(parsePasswordHash('')).toBeNull();
    expect(parsePasswordHash('scrypt$N=3,r=8,p=1$abc$def')).toBeNull(); // N not power of two
    expect(parsePasswordHash('bcrypt$2b$10$abc')).toBeNull();
  });

  it(
    'verifies a hash made with older (weaker) parameters and flags it for rehash',
    async () => {
      const legacy = await hashPassword('legacy-password', {
        N: 2 ** 14,
        r: 8,
        p: 1,
      });

      expect(legacy.startsWith('scrypt$N=16384,r=8,p=1$')).toBe(true);
      await expect(verifyPassword('legacy-password', legacy)).resolves.toBe(
        true,
      );
      expect(needsRehash(legacy)).toBe(true);

      const current = await hashPassword('current-password');
      expect(needsRehash(current)).toBe(false);
      expect(needsRehash('withdrawn')).toBe(true);
    },
    SCRYPT_TIMEOUT,
  );

  it(
    'treats NFC and NFD input as the same password (NFKC normalization)',
    async () => {
      const nfc = 'café-secret'; // é precomposed
      const nfd = 'café-secret'; // e + combining acute
      expect(nfc).not.toBe(nfd);

      const stored = await hashPassword(nfc);

      await expect(verifyPassword(nfd, stored)).resolves.toBe(true);
    },
    SCRYPT_TIMEOUT,
  );

  it(
    'fails (after a dummy verification) when the stored value is the withdrawn marker',
    async () => {
      await expect(verifyPassword('anything', 'withdrawn')).resolves.toBe(
        false,
      );
    },
    SCRYPT_TIMEOUT,
  );

  it(
    'never matches the dummy hash and always returns false from the dummy path',
    async () => {
      await expect(verifyDummyPassword('anything')).resolves.toBe(false);
      await expect(
        verifyPassword('anything', DUMMY_PASSWORD_HASH),
      ).resolves.toBe(false);
    },
    SCRYPT_TIMEOUT,
  );
});
