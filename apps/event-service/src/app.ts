import type { NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { LoggingHttpExceptionFilter } from './common/db-error.js';
import type { MemberLookup } from './members/member-client.js';
import type { PrismaService } from './prisma/prisma.service.js';

export interface CreateAppOptions {
  logger?: NestApplicationOptions['logger'];
  /** 통합 테스트는 끈다. */
  swagger?: boolean;
  /** 통합 테스트가 `inject('testDatabaseUrl')`로 만든 인스턴스. 없으면 env.DATABASE_URL (SPEC-002 D13). */
  prisma?: PrismaService;
  /** 통합 테스트의 가짜 회원 조회(member-service를 띄우지 않는다). 없으면 env.MEMBER_SERVICE_URL (SPEC-003 D13). */
  memberClient?: MemberLookup;
}

/**
 * event-service 앱을 조립한다(member-service와 같은 구조). `listen`은 하지 않는다 — `main.ts`가 부팅하고, 통합 테스트가 임시 포트로 띄운다.
 * 본문 파서는 JSON만 켠다 — urlencoded 파서가 없어 다른 content-type의 본문은 JsonContentTypeGuard에서 400이 된다.
 */
export async function createApp(
  options: CreateAppOptions = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(options.prisma, options.memberClient),
    {
      bodyParser: false,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    },
  );

  app.useBodyParser('json');
  app.useGlobalFilters(new LoggingHttpExceptionFilter());

  if (options.swagger !== false) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('오늘사이 Event Service')
      .setDescription(
        '모임 상품(Meetup) · 회차(Schedule) 운영자 관리와 참가자 공개 일정 조회를 담당하는 서비스 (SPEC-002). /health를 뺀 모든 경로는 Gateway의 x-internal-token이 있어야 한다.',
      )
      .setVersion('0.1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  return app;
}
