import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

// PrismaService는 AppModule의 PrismaModule.forRoot()가 global로 제공한다.
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
