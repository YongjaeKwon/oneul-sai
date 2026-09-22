import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // pnpm db:seed와 같은 명령 (SPEC-001 9절). 빌드(dist)가 먼저 있어야 한다.
    seed: 'node dist/seed/seed-admin.js',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
