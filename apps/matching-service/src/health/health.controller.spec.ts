import { HealthController } from './health.controller.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('HealthController', () => {
  it('returns ok when the database responds', async () => {
    const prisma = { $queryRaw: async () => [1] } as unknown as PrismaService;
    const controller = new HealthController(prisma);

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('up');
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it('returns degraded when the database query fails', async () => {
    const prisma = {
      $queryRaw: async () => {
        throw new Error('connection refused');
      },
    } as unknown as PrismaService;
    const controller = new HealthController(prisma);

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.database).toBe('down');
  });
});
