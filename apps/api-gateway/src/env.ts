import 'dotenv/config';
import { parseEnv, z } from '@oneul-sai/config';

export const env = parseEnv(
  z.object({
    PORT: z.coerce.number().default(4000),
    MEMBER_SERVICE_URL: z.string().default('http://localhost:4001'),
    EVENT_SERVICE_URL: z.string().default('http://localhost:4002'),
    MATCHING_SERVICE_URL: z.string().default('http://localhost:4003'),
    NOTIFICATION_SERVICE_URL: z.string().default('http://localhost:4004'),
    PAYMENT_SERVICE_URL: z.string().default('http://localhost:4005'),
  }),
);
