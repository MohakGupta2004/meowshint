import { z } from 'zod';

export const JOB_SCHEMA_VERSION = 1 as const;

export type JobKind = 'WEB_SEARCH' | 'SCRAPE' | 'ENRICH' | 'SUMMARIZE' | 'EXPORT';

// Mirrors the Prisma Platform enum minus WEB_SEARCH, which is its own JobKind.
const scrapePlatformSchema = z.enum([
  'INSTAGRAM',
  'LINKEDIN',
  'GITHUB',
  'TWITCH',
  'YOUTUBE',
  'TIKTOK',
  'PINTEREST',
  'LINKTREE',
]);

const baseJobFields = {
  schemaVersion: z.literal(JOB_SCHEMA_VERSION),
  sessionId: z.string(),
  taskId: z.string(),
  agentId: z.number().int(),
  enqueuedAt: z.string(),
};

const webSearchJobSchema = z.object({
  ...baseJobFields,
  kind: z.literal('WEB_SEARCH'),
  query: z.string(),
  queryContext: z.string().optional(),
});

const scrapeTargetSchema = z.object({
  handle: z.string().optional(),
  displayName: z.string(),
  profileUrl: z.string().optional(),
  locationHint: z.string().nullable().optional(),
});

const scrapeJobSchema = z.object({
  ...baseJobFields,
  kind: z.literal('SCRAPE'),
  platform: scrapePlatformSchema,
  target: scrapeTargetSchema,
});

export const jobDataSchema = z.discriminatedUnion('kind', [webSearchJobSchema, scrapeJobSchema]);

export type WebSearchJobData = z.infer<typeof webSearchJobSchema>;
export type ScrapeJobData = z.infer<typeof scrapeJobSchema>;
export type JobData = z.infer<typeof jobDataSchema>;
