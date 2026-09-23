import { Module, type DynamicModule } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Module({})
export class PrismaModule {
  /**
   * 앱 전체가 쓰는 PrismaService 하나(global). 인스턴스를 넘기면 그것을 쓴다 — 통합 테스트가
   * `inject('testDatabaseUrl')`로 만든 것이다(SPEC-002 D13). 없으면 Nest가 env.DATABASE_URL로 만든다.
   */
  static forRoot(prisma?: PrismaService): DynamicModule {
    return {
      module: PrismaModule,
      global: true,
      providers: [
        prisma === undefined
          ? PrismaService
          : { provide: PrismaService, useValue: prisma },
      ],
      exports: [PrismaService],
    };
  }
}
