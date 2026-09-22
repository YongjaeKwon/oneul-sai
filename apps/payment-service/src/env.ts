import 'dotenv/config';
import { parseEnv, z } from '@oneul-sai/config';

export const env = parseEnv(
  z.object({
    PORT: z.coerce.number().default(4005),
    DATABASE_URL: z
      .string()
      .default('postgresql://oneul:oneul@localhost:5432/payment_db'),
  }),
);
