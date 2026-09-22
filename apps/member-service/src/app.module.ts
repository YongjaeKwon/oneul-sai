import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { InternalAuthGuard } from './auth/guards/internal-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { env } from './env.js';
import { HealthModule } from './health/health.module.js';
import { MembersModule } from './members/members.module.js';

@Module({
  imports: [HealthModule, AuthModule, MembersModule],
  providers: [
    // 전역 가드는 등록 순서대로 돈다: 내부 토큰 · 내부 헤더 신뢰 규칙 → 역할 (SPEC-001 7절).
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) =>
        new InternalAuthGuard(reflector, env.INTERNAL_API_TOKEN),
      inject: [Reflector],
    },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
