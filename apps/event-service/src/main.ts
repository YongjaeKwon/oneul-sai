// env는 dotenv side effect 때문에 다른 모듈보다 먼저 로드되어야 한다.
import { env } from './env.js';
import { SERVICE_NAMES } from '@oneul-sai/constants';
import { createLogger } from '@oneul-sai/logger';
import { createApp } from './app.js';

const logger = createLogger({ service: SERVICE_NAMES.eventService });

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(env.PORT);
  logger.info(`event-service listening on http://localhost:${env.PORT}`);
}

await bootstrap();
