// env는 dotenv side effect 때문에 다른 모듈보다 먼저 로드되어야 한다.
import { env } from './env.js';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SERVICE_NAMES } from '@oneul-sai/constants';
import { createLogger } from '@oneul-sai/logger';
import { AppModule } from './app.module.js';

const logger = createLogger({ service: SERVICE_NAMES.memberService });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('오늘 사이 Member Service')
    .setDescription(
      '회원, 로그인, 인증, 프로필, 본인 인증 정보, 계정 상태를 담당하는 서비스',
    )
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(env.PORT);
  logger.info(`member-service listening on http://localhost:${env.PORT}`);
}

await bootstrap();
