// env는 dotenv side effect 때문에 다른 모듈보다 먼저 로드되어야 한다.
import { env } from './env.js';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SERVICE_NAMES } from '@oneul-sai/constants';
import { createLogger } from '@oneul-sai/logger';
import { AppModule } from './app.module.js';

const logger = createLogger({ service: SERVICE_NAMES.matchingService });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('오늘 사이 Matching Service')
    .setDescription(
      '호감 선택, Preference, 상호 선택 판별, Match 생성, Match 결과를 담당하는 서비스',
    )
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(env.PORT);
  logger.info(`matching-service listening on http://localhost:${env.PORT}`);
}

await bootstrap();
