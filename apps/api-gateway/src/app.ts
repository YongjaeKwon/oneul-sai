import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HEADER_REQUEST_ID } from '@oneul-sai/constants';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AppModule } from './app.module.js';
import { decodeAccessSecret } from './auth/jwt.js';
import type { GatewayEnv } from './env.schema.js';
import { HttpExceptionFilter } from './filters/http-exception.filter.js';
import { createAuthMiddleware } from './middleware/auth.middleware.js';
import { createOriginCheckMiddleware } from './middleware/origin-check.middleware.js';
import { createRateLimitMiddleware } from './middleware/rate-limit.middleware.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { requestLoggerMiddleware } from './middleware/request-logger.middleware.js';
import { attachInternalHeaders } from './proxy/proxy-req.js';
import { createProxyRoutes } from './proxy/routes.js';

/**
 * Gateway 앱을 조립한다. `listen`은 하지 않는다 — `main.ts`가 부팅하고, `app.spec.ts`가 임시 포트로 띄워 미들웨어 순서를 검증한다.
 *
 * 미들웨어 순서: request-id → 로거 → CORS → Origin 확인 → rate limit → auth(Bearer 검증) → 프록시(/api/v1/**) → Nest 라우트(/health, /docs).
 * `app.use` · `enableCors`는 호출 순서대로 Express에 등록되고, Nest의 body parser와 라우트는 `init`(listen) 시점에 그 뒤에 붙는다 —
 * 그래서 프록시는 파싱되지 않은 본문 스트림을 그대로 넘긴다.
 */
export async function createGatewayApp(
  env: GatewayEnv,
  options: NestApplicationOptions = {},
): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, options);

  app.use(requestIdMiddleware, requestLoggerMiddleware);

  // 프록시보다 앞에 두어 OPTIONS preflight가 프록시로 가지 않게 한다 (SPEC-001 10절).
  // 프록시 응답의 Set-Cookie는 http-proxy가 그대로 통과시킨다 (cookieDomainRewrite 없음).
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    allowedHeaders: ['authorization', 'content-type', HEADER_REQUEST_ID],
    exposedHeaders: [HEADER_REQUEST_ID],
  });

  app.use(createOriginCheckMiddleware({ allowedOrigins: env.CORS_ORIGINS }));
  app.use(
    createRateLimitMiddleware({
      limitPerMinute: env.RATE_LIMIT_AUTH_PER_MINUTE,
    }),
  );
  app.use(
    createAuthMiddleware({ secret: decodeAccessSecret(env.JWT_ACCESS_SECRET) }),
  );

  // 프록시는 Nest 라우팅보다 먼저 등록되어 /api/v1/**를 가로챈다.
  // http-proxy-middleware의 `logger` 옵션은 지정하지 않는다 — 프록시 대상 URL을 query 포함 자체 로그로 남긴다 (SPEC-001 12절).
  for (const route of createProxyRoutes(env)) {
    app.use(
      createProxyMiddleware({
        target: route.target,
        changeOrigin: true,
        pathFilter: route.pathFilter,
        on: {
          proxyReq: (proxyReq, req) => {
            attachInternalHeaders(proxyReq, req, env.INTERNAL_API_TOKEN);
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

  return app;
}
