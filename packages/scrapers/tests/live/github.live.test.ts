import { describe, expect, it } from 'bun:test';

import { githubScraper } from '../../src/handlers/github';
import type { ScrapeDeps } from '../../src/types';

// Never runs in CI — a canary for silent upstream shape changes. Run manually:
//   SCOUT_LIVE=1 bun test tests/live/github.live.test.ts
describe.skipIf(process.env.SCOUT_LIVE !== '1')('github live', () => {
  it('scrapes the real octocat account', async () => {
    const deps: ScrapeDeps = {
      fetchImpl: fetch,
      sleep: async () => {},
      random: Math.random,
      now: () => new Date(),
      logger: { debug() {}, warn() {}, error() {} },
      config: {
        delayMinMs: 500,
        delayMaxMs: 1500,
        timeoutMs: 10_000,
        maxCandidates: 10,
        githubToken: process.env.GITHUB_TOKEN,
      },
    };
    const out = await githubScraper({ platform: 'GITHUB', handle: 'octocat' }, deps);
    expect(out.status).toBe('FOUND');
    expect((out as any).result.username).toBe('octocat');
  });
});
