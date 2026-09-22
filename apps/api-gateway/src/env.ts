import 'dotenv/config';
import { parseEnv } from '@oneul-sai/config';
import { envSchema } from './env.schema.js';

export const env = parseEnv(envSchema);
