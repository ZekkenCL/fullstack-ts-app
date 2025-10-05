import { z, ZodIssue } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().url().min(1, 'DATABASE_URL required'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET min length 8'),
  REFRESH_TOKEN_TTL_DAYS: z.string().regex(/^\d+$/).default('7'),
  REFRESH_TOKEN_MAX_ACTIVE: z.string().regex(/^\d+$/).default('5'),
  PORT: z.string().regex(/^\d+$/).optional(),
  REDIS_HOST: z.string().optional().nullable(),
  REDIS_PORT: z.string().regex(/^\d+$/).optional().nullable(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(raw: NodeJS.ProcessEnv): AppEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
  const issues = parsed.error.issues.map((issue: ZodIssue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
    throw new Error('Environment validation error: ' + issues);
  }
  return parsed.data;
}
