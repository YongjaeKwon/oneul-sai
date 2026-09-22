import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { SERVICE_NAMES } from '@oneul-sai/constants';

@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'API Gateway 헬스 체크' })
  @ApiOkResponse({ description: '게이트웨이 프로세스 상태를 반환한다.' })
  getHealth(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: SERVICE_NAMES.apiGateway,
      timestamp: new Date().toISOString(),
    };
  }
}
