import 'dotenv/config';
import { z } from 'zod';

// Coerces "true"/"1"/true -> true, everything else (including "false") -> false.
// z.coerce.boolean() is a footgun here: any non-empty string, including the
// literal string "false", coerces to true.
function booleanEnv(defaultValue: boolean) {
  return z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined) return defaultValue;
      if (typeof v === 'boolean') return v;
      return v === 'true' || v === '1';
    });
}

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
  // Scraping / worker env vars (all optional, safe defaults)
  GITHUB_TOKEN: z.string().optional(),
  ENABLE_LINKEDIN_SCRAPER: booleanEnv(false),
  SCOUT_PROXY: z.string().optional(),
  SCOUT_PROXY_FILE: z.string().optional(),
  SCOUT_FREE_PROXY: booleanEnv(false),
  SCOUT_DELAY_MIN: z.coerce.number().int().optional(),
  SCOUT_DELAY_MAX: z.coerce.number().int().optional(),
  SCOUT_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  SCOUT_MAX_CANDIDATES: z.coerce.number().int().positive().default(10),
  SEARXNG_URL: z.string().default('http://localhost:8080'),
  // Process topology — both true by default (single deploy unit); split later
  // by setting one false on each instance.
  RUN_API: booleanEnv(true),
  RUN_WORKER: booleanEnv(false),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables: ${JSON.stringify(z.flattenError(parsed.error).fieldErrors)}`
    );
  }
  return parsed.data;
}

export const env = parseEnv(process.env);
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
