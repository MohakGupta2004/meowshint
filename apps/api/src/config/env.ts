import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  CORS_ORIGINS: z.string().default('*'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  JWT_ACCESS_SECRET: z.string().min(1).default('super-secret-access-key-change-in-production'),
  JWT_REFRESH_SECRET: z.string().min(1).default('super-secret-refresh-key-change-in-production'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  // Scraping env vars (all optional, safe defaults)
  GITHUB_TOKEN: z.string().optional(),
  ENABLE_LINKEDIN_SCRAPER: z.coerce.boolean().default(false),
  SCOUT_PROXY: z.string().optional(),
  SCOUT_PROXY_FILE: z.string().optional(),
  SCOUT_FREE_PROXY: z.string().optional(),
  SCOUT_DELAY_MIN: z.coerce.number().int().optional(),
  SCOUT_DELAY_MAX: z.coerce.number().int().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
