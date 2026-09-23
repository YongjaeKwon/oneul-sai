import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { InternalAuthGuard, RolesGuard } from '@oneul-sai/service-kit';
import { env } from './env.js';
import { EventsModule } from './events/events.module.js';
import { HealthModule } from './health/health.module.js';
import { MeetupsModule } from './meetups/meetups.module.js';
import type { PrismaService } from './prisma/prisma.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SchedulesModule } from './schedules/schedules.module.js';

@Module({})
export class AppModule {
  /** `prisma`는 통합 테스트만 넘긴다(SPEC-002 D13). */
  static forRoot(prisma?: PrismaService): DynamicModule {
    return {
      module: AppModule,
      imports: [
        PrismaModule.forRoot(prisma),
        HealthModule,
        EventsModule,
        MeetupsModule,
        SchedulesModule,
      ],
      providers: [
        // 전역 가드는 등록 순서대로 돈다: 내부 토큰 · 내부 헤더 신뢰 규칙 → 역할 (SPEC-002 10절, member-service와 같다).
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector) =>
            new InternalAuthGuard(reflector, env.INTERNAL_API_TOKEN),
          inject: [Reflector],
        },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    };
  }
}
