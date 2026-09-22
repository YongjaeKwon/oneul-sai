import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// SPEC-001 12절 "비밀번호 정책과 해시".
// 순수 함수만 둔다. 동시 실행 상한 · 대기 큐(503 SERVICE_BUSY)는 PasswordService(auth 모듈)가 이 함수들 위에 얹는다.

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/** OWASP Password Storage Cheat Sheet 권고값 (N = 2^17, r = 8, p = 1) */
export const SCRYPT_PARAMS: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };
const SALT_BYTES = 16;
const KEY_BYTES = 64;
/** 기본 32MiB로는 N=2^17(128 · N · r = 128MiB)이 실패한다 */
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

/**
 * 없는 이메일(열거 방지)과 형식이 아닌 저장값(탈퇴 표식 'withdrawn')에 대해 응답 시간을 맞추기 위한 고정 더미 해시.
 * 원문은 생성 직후 버려진 32바이트 랜덤이라 어떤 입력도 일치하지 않는다.
 */
export const DUMMY_PASSWORD_HASH =
  'scrypt$N=131072,r=8,p=1$vdRfvtFQvvtsJOw_7hjpPA$6uy_n8RyCuqqTU4Zu02Ygx5IL7xYACn4xKDyzJFWOtHt5jCzMzMDqSsVLmuxJgKScpOYWavPVkQ7cnZ66XDLJA';

/** 저장 형식 `scrypt$N=<N>,r=<r>,p=<p>$<salt b64url>$<hash b64url>` */
const STORED_FORMAT =
  /^scrypt\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

export interface ParsedPasswordHash {
  params: ScryptParams;
  salt: Buffer;
  key: Buffer;
}

const isPowerOfTwo = (n: number): boolean => n > 1 && (n & (n - 1)) === 0;

/** 형식에 맞지 않으면 null (탈퇴 표식 등). 파라미터를 문자열에서 읽으므로 옛 해시도 검증할 수 있다 */
export function parsePasswordHash(stored: string): ParsedPasswordHash | null {
  const match = STORED_FORMAT.exec(stored);
  if (!match) return null;

  const [, N, r, p, salt, key] = match;
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  if (!isPowerOfTwo(params.N) || params.r < 1 || params.p < 1) return null;

  const saltBuffer = Buffer.from(salt ?? '', 'base64url');
  const keyBuffer = Buffer.from(key ?? '', 'base64url');
  if (saltBuffer.length === 0 || keyBuffer.length === 0) return null;

  return { params, salt: saltBuffer, key: keyBuffer };
}

const dummy = parsePasswordHash(DUMMY_PASSWORD_HASH);
if (!dummy) {
  throw new Error('DUMMY_PASSWORD_HASH 형식 오류');
}
const DUMMY = dummy;

/** 입력기 · 플랫폼에 따른 NFC/NFD 차이로 같은 비밀번호가 실패하지 않게 NFKC로 정규화한다 */
function normalizePassword(password: string): Buffer {
  return Buffer.from(password.normalize('NFKC'), 'utf8');
}

function deriveKey(
  password: Buffer,
  salt: Buffer,
  params: ScryptParams,
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      { ...params, maxmem: SCRYPT_MAXMEM },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(key);
      },
    );
  });
}

/** 랜덤 salt 16바이트, 출력 64바이트. 결과는 `Member.passwordHash`에 그대로 저장한다 */
export async function hashPassword(
  password: string,
  params: ScryptParams = SCRYPT_PARAMS,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(
    normalizePassword(password),
    salt,
    params,
    KEY_BYTES,
  );
  return `scrypt$N=${params.N},r=${params.r},p=${params.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/**
 * 저장값이 형식에 맞지 않으면(탈퇴 표식 'withdrawn') 더미 검증을 거친 뒤 false — 응답 시간이 균일하다.
 * 비교는 timingSafeEqual.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parsePasswordHash(stored);
  if (!parsed) {
    return verifyDummyPassword(password);
  }

  const key = await deriveKey(
    normalizePassword(password),
    parsed.salt,
    parsed.params,
    parsed.key.length,
  );
  return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
}

/** 없는 이메일에 대해 scrypt를 정확히 한 번 실행하고 항상 false를 돌려준다 (이메일 열거 방지) */
export async function verifyDummyPassword(password: string): Promise<false> {
  await deriveKey(
    normalizePassword(password),
    DUMMY.salt,
    DUMMY.params,
    DUMMY.key.length,
  );
  return false;
}

/** 저장값의 파라미터가 현재 파라미터와 다르면 true — 로그인 성공 시 재해시 대상 */
export function needsRehash(
  stored: string,
  params: ScryptParams = SCRYPT_PARAMS,
): boolean {
  const parsed = parsePasswordHash(stored);
  if (!parsed) return true;
  return (
    parsed.params.N !== params.N ||
    parsed.params.r !== params.r ||
    parsed.params.p !== params.p ||
    parsed.key.length !== KEY_BYTES
  );
}
