import type { NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SERVICE_NAMES } from '@oneul-sai/constants';
import { createLogger } from '@oneul-sai/logger';
import { HttpExceptionFilter } from '@oneul-sai/service-kit';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

export interface CreateAppOptions {
  logger?: NestApplicationOptions['logger'];
  /** 통합 테스트는 끈다. */
  swagger?: boolean;
}

/**
 * member-service 앱을 조립한다. `listen`은 하지 않는다 — `main.ts`가 부팅하고, 통합 테스트가 임시 포트로 띄운다.
 * 본문 파서는 JSON만 켠다 — urlencoded 파서를 켜지 않아 다른 사이트의 form 제출이 본문으로 읽히지 않는다 (SPEC-001 12절 로그인 CSRF).
 */
export async function createApp(
  options: CreateAppOptions = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
  });

  app.useBodyParser('json');
  app.use(cookieParser());
  app.useGlobalFilters(
    new HttpExceptionFilter(
      createLogger({ service: SERVICE_NAMES.memberService }),
    ),
  );

  if (options.swagger !== false) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('오늘사이 Member Service')
      .setDescription(
        '회원, 로그인, 인증, 프로필, 계정 상태를 담당하는 서비스. /health를 뺀 모든 경로는 Gateway의 x-internal-token이 있어야 한다.',
      )
      .setVersion('0.1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  return app;
}
