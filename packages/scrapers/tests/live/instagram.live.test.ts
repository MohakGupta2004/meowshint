import { describe, expect, it } from 'bun:test';

import { instagramScraper } from '../../src/handlers/instagram';
import type { ScrapeDeps } from '../../src/types';

// Never runs in CI — a canary for silent HTML/API shape changes. Run manually:
//   SCOUT_LIVE=1 bun test tests/live/instagram.live.test.ts
describe.skipIf(process.env.SCOUT_LIVE !== '1')('instagram live', () => {
  it('scrapes a known public account', async () => {
    const deps: ScrapeDeps = {
      fetchImpl: fetch,
      sleep: async () => {},
      random: Math.random,
      now: () => new Date(),
      logger: { debug() {}, warn() {}, error() {} },
      config: { delayMinMs: 1000, delayMaxMs: 3000, timeoutMs: 10_000, maxCandidates: 10 },
    };
    const out = await instagramScraper({ platform: 'INSTAGRAM', handle: 'instagram' }, deps);
    expect(out.status).toBe('FOUND');
  });
});
