import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { SERVICE_NAMES } from '@oneul-sai/constants';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: '서비스 및 데이터베이스 상태 확인' })
  @ApiOkResponse({
    description: 'status(ok|degraded), service, database(up|down), timestamp',
  })
  async check() {
    let database: 'up' | 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: SERVICE_NAMES.paymentService,
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
