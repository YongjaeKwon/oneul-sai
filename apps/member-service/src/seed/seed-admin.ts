// env는 dotenv side effect 때문에 다른 모듈보다 먼저 로드되어야 한다.
import { env } from '../env.js';
import { readFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from '@oneul-sai/config';
import { SERVICE_NAMES } from '@oneul-sai/constants';
import { createLogger } from '@oneul-sai/logger';
import { PrismaClient } from '../generated/prisma/client.js';
import { ensureAdmin, SeedAdminError } from './ensure-admin.js';

// 실행: pnpm --filter @oneul-sai/member-service build && pnpm --filter @oneul-sai/member-service db:seed
// 입력: SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, 비밀번호는 SEED_ADMIN_PASSWORD_FILE > SEED_ADMIN_PASSWORD(로컬 전용) > stdin,
//       SEED_ADMIN_RESET_PASSWORD=true면 기존 ADMIN의 비밀번호를 갱신한다 (SPEC-001 9절).

const logger = createLogger({ service: SERVICE_NAMES.memberService });

/** 가입과 같은 규칙 (SPEC-001 12절): 8~64자, 공백만 금지. NFKC 정규화는 hashPassword가 한다 */
const passwordSchema = z
  .string()
  .min(8)
  .max(64)
  .refine((v) => v.trim().length > 0);

const stripTrailingNewline = (value: string): string =>
  value.replace(/\r?\n$/, '');

async function readPassword(): Promise<string> {
  if (env.SEED_ADMIN_PASSWORD_FILE) {
    return stripTrailingNewline(
      await readFile(env.SEED_ADMIN_PASSWORD_FILE, 'utf8'),
    );
  }

  if (env.SEED_ADMIN_PASSWORD !== undefined) {
    if (env.NODE_ENV === 'production') {
      throw new SeedAdminError(
        'SEED_ADMIN_PASSWORD(env)는 로컬 전용이다. 프로덕션은 SEED_ADMIN_PASSWORD_FILE 또는 stdin으로 준다',
      );
    }
    return env.SEED_ADMIN_PASSWORD;
  }

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(
        typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk,
      );
    }
    return stripTrailingNewline(Buffer.concat(chunks).toString('utf8'));
  }

  throw new SeedAdminError(
    '비밀번호가 없다. SEED_ADMIN_PASSWORD_FILE 또는 stdin으로 준다',
  );
}

async function main(): Promise<void> {
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_NAME) {
    throw new SeedAdminError('SEED_ADMIN_EMAIL · SEED_ADMIN_NAME이 필요하다');
  }

  const password = passwordSchema.safeParse(await readPassword());
  if (!password.success) {
    throw new SeedAdminError(
      '비밀번호 규칙 위반: 8~64자, 공백만으로는 안 된다',
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  try {
    const result = await ensureAdmin(prisma, {
      email: env.SEED_ADMIN_EMAIL,
      name: env.SEED_ADMIN_NAME,
      password: password.data,
      resetPassword: env.SEED_ADMIN_RESET_PASSWORD,
    });
    logger.info('seed.admin', {
      action: result.action,
      memberId: result.memberId,
      revokedTokens: result.revokedTokens,
    });
  } finally {
    await prisma.$disconnect();
  }
}

try {
  await main();
} catch (error) {
  logger.error('seed.admin.failed', {
    reason: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}
