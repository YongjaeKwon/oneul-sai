import { Injectable, Optional, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../env.js';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  // Nest는 인자 없이 만든다(env.DATABASE_URL). 통합 테스트만 inject('testDatabaseUrl')를 넘긴다 (SPEC-002 D13)
  constructor(@Optional() connectionString: string = env.DATABASE_URL) {
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
