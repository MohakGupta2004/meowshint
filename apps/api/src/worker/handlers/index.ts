import type { ScrapeDeps, ScrapePlatform, ScraperHandler } from '@repo/scrapers';
import { createScraperHandlers, createSearxngSearchEngine } from '@repo/scrapers';

import { env } from '../../config/env';
import { logger } from '../../lib/logger';

export const scraperHandlers: Partial<Record<ScrapePlatform, ScraperHandler>> =
  createScraperHandlers(createSearxngSearchEngine(env.SEARXNG_URL));

export function getHandler(platform: ScrapePlatform): ScraperHandler | undefined {
  return scraperHandlers[platform];
}

export function buildScrapeDeps(): ScrapeDeps {
  return {
    fetchImpl: fetch,
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
    now: () => new Date(),
    logger,
    config: {
      githubToken: env.GITHUB_TOKEN,
      proxy: env.SCOUT_PROXY,
      proxyFile: env.SCOUT_PROXY_FILE,
      freeProxy: env.SCOUT_FREE_PROXY,
      delayMinMs: env.SCOUT_DELAY_MIN ?? 0,
      delayMaxMs: env.SCOUT_DELAY_MAX ?? 0,
      timeoutMs: env.SCOUT_HTTP_TIMEOUT_MS,
      maxCandidates: env.SCOUT_MAX_CANDIDATES,
    },
  };
}
