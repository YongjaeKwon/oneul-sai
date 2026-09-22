import './env.js';
import { SERVICE_NAMES } from '@oneul-sai/constants';
import { createLogger } from '@oneul-sai/logger';
import { createGatewayApp } from './app.js';
import { env } from './env.js';

const logger = createLogger({ service: SERVICE_NAMES.apiGateway });

async function bootstrap(): Promise<void> {
  const app = await createGatewayApp(env);
  await app.listen(env.PORT);
  logger.info(`api-gateway listening on port ${env.PORT}`);
}

await bootstrap();
