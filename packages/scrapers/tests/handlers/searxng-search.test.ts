import { expect, it, mock } from 'bun:test';

import { UpstreamServerError } from '../../src/errors';
import { createSearxngSearchEngine } from '../../src/handlers/searxng-search';
import type { ScrapeDeps } from '../../src/types';

function baseDeps(fetchImpl: ScrapeDeps['fetchImpl']): ScrapeDeps {
  return {
    fetchImpl,
    sleep: mock(async () => {}),
    random: () => 0,
    now: () => new Date('2026-01-01T00:00:00Z'),
    logger: { debug: mock(), warn: mock(), error: mock() },
    config: { delayMinMs: 0, delayMaxMs: 0, timeoutMs: 5000, maxCandidates: 10 },
  };
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

// SX1
it('maps results[] -> {title, url, snippet}, snippet from content', async () => {
  const fetchImpl = mock(async () =>
    jsonRes({
      results: [
        { title: 'Jane Doe', url: 'https://example.com/jane', content: 'A person named Jane' },
      ],
    })
  );
  const engine = createSearxngSearchEngine('http://localhost:8080');
  const out = await engine('jane doe', baseDeps(fetchImpl));
  expect(out).toEqual([
    { title: 'Jane Doe', url: 'https://example.com/jane', snippet: 'A person named Jane' },
  ]);
});

// SX2
it('empty results array returns []', async () => {
  const fetchImpl = mock(async () => jsonRes({ results: [] }));
  const engine = createSearxngSearchEngine('http://localhost:8080');
  const out = await engine('nobody', baseDeps(fetchImpl));
  expect(out).toEqual([]);
});

// SX3
it('403 throws UpstreamServerError naming the missing json format setting', async () => {
  const fetchImpl = mock(async () => new Response('Forbidden', { status: 403 }));
  const engine = createSearxngSearchEngine('http://localhost:8080');
  try {
    await engine('x', baseDeps(fetchImpl));
    throw new Error('expected to throw');
  } catch (err) {
    expect(err).toBeInstanceOf(UpstreamServerError);
    expect((err as Error).message).toContain('search.formats');
  }
});

// SX4
it('5xx throws mapped UpstreamServerError', async () => {
  const fetchImpl = mock(async () => new Response('', { status: 502 }));
  const engine = createSearxngSearchEngine('http://localhost:8080');
  await expect(engine('x', baseDeps(fetchImpl))).rejects.toThrow(UpstreamServerError);
});
