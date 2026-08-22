import { expect, it, mock } from 'bun:test';

import { type SearchResultItem, createWebSearchScraper } from '../../src/handlers/web-search';
import type { ScrapeDeps } from '../../src/types';

function baseDeps(maxCandidates = 10): ScrapeDeps {
  return {
    fetchImpl: mock(),
    sleep: mock(async () => {}),
    random: () => 0,
    now: () => new Date('2026-01-01T00:00:00Z'),
    logger: { debug: mock(), warn: mock(), error: mock() },
    config: { delayMinMs: 0, delayMaxMs: 0, timeoutMs: 5000, maxCandidates },
  };
}

function mkResults(n: number): SearchResultItem[] {
  return Array.from({ length: n }, (_, i) => ({
    title: `Result ${i}`,
    url: `https://example.com/${i}`,
    snippet: `snippet ${i}`,
  }));
}

// W1
it('maps the SERP fixture to the results[] shape', async () => {
  const items = mkResults(5);
  const scraper = createWebSearchScraper(async () => items);
  const out = await scraper({ platform: 'WEB_SEARCH', query: 'jane doe' }, baseDeps());
  const result = (out as any).result;
  expect(result.results.length).toBe(5);
  for (const r of result.results) {
    expect(typeof r.title).toBe('string');
    expect(typeof r.url).toBe('string');
    expect(typeof r.snippet).toBe('string');
  }
});

// W2
it('extracts discoveredHandles from result URLs', async () => {
  const items: SearchResultItem[] = [
    { title: 'GH', url: 'https://github.com/octocat', snippet: '' },
    { title: 'IG', url: 'https://instagram.com/jane_doe', snippet: '' },
  ];
  const scraper = createWebSearchScraper(async () => items);
  const out = await scraper({ platform: 'WEB_SEARCH', query: 'jane doe' }, baseDeps());
  const result = (out as any).result;
  expect(result.discoveredHandles.GITHUB).toBe('octocat');
  expect(result.discoveredHandles.INSTAGRAM).toBe('jane_doe');
});

// W3
it('caps candidate drafts at config.maxCandidates', async () => {
  const items = mkResults(20);
  const scraper = createWebSearchScraper(async () => items);
  const out = await scraper({ platform: 'WEB_SEARCH', query: 'x' }, baseDeps(10));
  expect((out as any).candidates.length).toBe(10);
});

// W4
it('candidate ranks are dense 0..n-1', async () => {
  const items = mkResults(4);
  const scraper = createWebSearchScraper(async () => items);
  const out = await scraper({ platform: 'WEB_SEARCH', query: 'x' }, baseDeps());
  const ranks = (out as any).candidates.map((c: any) => c.rank);
  expect(ranks).toEqual([0, 1, 2, 3]);
});

// W5
it('zero results returns FOUND with empty candidates, not NOT_FOUND', async () => {
  const scraper = createWebSearchScraper(async () => []);
  const out = await scraper({ platform: 'WEB_SEARCH', query: 'nobody' }, baseDeps());
  expect(out.status).toBe('FOUND');
  expect((out as any).candidates).toEqual([]);
});
