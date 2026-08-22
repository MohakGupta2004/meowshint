import type { ScrapePlatform, ScraperHandler } from '../types';
import { githubScraper } from './github';
import { instagramScraper } from './instagram';
import { type SearchEngine, createWebSearchScraper } from './web-search';

// Deliberately Partial: an unimplemented platform resolves to undefined, which the
// worker maps to SKIPPED + refund with errorCode 'NOT_IMPLEMENTED' — not a crash.
export function createScraperHandlers(
  searchEngine: SearchEngine
): Partial<Record<ScrapePlatform, ScraperHandler>> {
  return {
    WEB_SEARCH: createWebSearchScraper(searchEngine),
    GITHUB: githubScraper,
    INSTAGRAM: instagramScraper,
  };
}

export { githubScraper, instagramScraper, createWebSearchScraper };
export type { SearchEngine };
