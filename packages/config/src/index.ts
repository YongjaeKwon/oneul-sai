import { z, type ZodType } from 'zod';

export { z } from 'zod';

export function parseEnv<TSchema extends ZodType>(
  schema: TSchema,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<TSchema> {
  const result = schema.safeParse(source);

  if (!result.success) {
    for (const issue of result.error.issues) {
      process.stderr.write(`${issue.path.join('.')}: ${issue.message}\n`);
    }
    throw new Error('Invalid environment variables');
  }

  return result.data as z.infer<TSchema>;
}
