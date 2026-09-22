import './env.js';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HEADER_REQUEST_ID, SERVICE_NAMES } from '@oneul-sai/constants';
import { createLogger } from '@oneul-sai/logger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AppModule } from './app.module.js';
import { env } from './env.js';
import { HttpExceptionFilter } from './filters/http-exception.filter.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { requestLoggerMiddleware } from './middleware/request-logger.middleware.js';
import { proxyRoutes } from './proxy/routes.js';

const logger = createLogger({ service: SERVICE_NAMES.apiGateway });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(requestIdMiddleware, requestLoggerMiddleware);

  // Proxy는 Nest 라우팅보다 먼저 등록되어 /api/v1/**를 가로챈다.
  for (const route of proxyRoutes) {
    app.use(
      createProxyMiddleware({
        target: route.target,
        changeOrigin: true,
        pathFilter: route.pathFilter,
        on: {
          proxyReq: (proxyReq, req) => {
            const requestId = req.headers[HEADER_REQUEST_ID];
            if (typeof requestId === 'string') {
              proxyReq.setHeader(HEADER_REQUEST_ID, requestId);
            }
          },
        },
      }),
    );
  }

  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('오늘사이 API Gateway')
    .setDescription(
      '외부 클라이언트의 단일 진입점. /api/v1/** 요청을 내부 서비스로 프록시한다.',
    )
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(env.PORT);
  logger.info(`api-gateway listening on port ${env.PORT}`);
}

await bootstrap();
