import { UpstreamServerError } from '../errors';
import { createHttpClient } from '../http/client';
import type { ScrapeDeps } from '../types';
import type { SearchEngine, SearchResultItem } from './web-search';

interface SearxngResponse {
  results: Array<{ title: string; url: string; content: string }>;
}

export function createSearxngSearchEngine(baseUrl: string): SearchEngine {
  return async (query: string, deps: ScrapeDeps): Promise<SearchResultItem[]> => {
    const client = createHttpClient(deps);
    const url = `${baseUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(query)}&format=json`;

    try {
      const { body } = await client.request<SearxngResponse>({
        url,
        platform: 'WEB_SEARCH',
        expect: 'json',
      });

      return (body.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
      }));
    } catch (err) {
      if (err instanceof UpstreamServerError && err.context?.status === 403) {
        throw new UpstreamServerError(
          'SearXNG returned 403 — check that search.formats includes "json" in searxng/settings.yml',
          err.context
        );
      }
      throw err;
    }
  };
}
