import { discoverHandles } from '../extract/handles';
import type {
  CandidateDraft,
  ScrapeDeps,
  ScrapeInput,
  ScrapeOutcome,
  ScraperHandler,
} from '../types';

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

// Pluggable so the search engine can be swapped without touching the handler contract.
export type SearchEngine = (query: string, deps: ScrapeDeps) => Promise<SearchResultItem[]>;

export function createWebSearchScraper(searchEngine: SearchEngine): ScraperHandler {
  return async (input: ScrapeInput, deps: ScrapeDeps): Promise<ScrapeOutcome> => {
    const query = input.query ?? '';
    const results = await searchEngine(query, deps);

    const allUrls = results.map((r) => r.url);
    const discoveredHandles = discoverHandles(allUrls);

    const cap = deps.config.maxCandidates;
    const candidates: CandidateDraft[] = results.slice(0, cap).map((r, i) => ({
      displayName: r.title,
      snippet: r.snippet,
      sourceUrl: r.url,
      rank: i,
    }));

    return {
      status: 'FOUND',
      result: {
        query,
        engine: 'web',
        totalResults: results.length,
        results,
        discoveredHandles,
        summaryText: `Search for "${query}" returned ${results.length} result${results.length === 1 ? '' : 's'}.`,
      },
      candidates,
    };
  };
}
