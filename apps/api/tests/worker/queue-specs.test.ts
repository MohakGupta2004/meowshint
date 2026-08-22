import { expect, it } from 'bun:test';

import { DEFAULT_SPEC, buildQueueSpecs, getSpec, routeJob } from '../../src/worker/queue-specs';

const PLATFORMS = [
  'WEB_SEARCH',
  'INSTAGRAM',
  'LINKEDIN',
  'GITHUB',
  'TWITCH',
  'YOUTUBE',
  'TIKTOK',
  'PINTEREST',
  'LINKTREE',
] as const;

const KINDS = ['WEB_SEARCH', 'SCRAPE', 'ENRICH', 'SUMMARIZE', 'EXPORT'] as const;

// T47
it('every Platform enum value resolves to a defined spec', () => {
  const specs = buildQueueSpecs(undefined);
  for (const platform of PLATFORMS) {
    const queueName =
      platform === 'WEB_SEARCH'
        ? routeJob({ kind: 'WEB_SEARCH' })
        : routeJob({ kind: 'SCRAPE', platform });
    const spec = getSpec(queueName, specs);
    expect(spec).toBeDefined();
    expect(spec.concurrency).toBeGreaterThan(0);
  }
});

// T48
it('routeJob is total over JobKind and never throws', () => {
  for (const kind of KINDS) {
    expect(() =>
      routeJob({ kind, platform: kind === 'SCRAPE' ? 'GITHUB' : undefined })
    ).not.toThrow();
    expect(typeof routeJob({ kind, platform: kind === 'SCRAPE' ? 'GITHUB' : undefined })).toBe(
      'string'
    );
  }
});

// T49
it('GITHUB spec differs with a token present vs absent', () => {
  const withToken = buildQueueSpecs('ghp_x')['scout:github'];
  const withoutToken = buildQueueSpecs(undefined)['scout:github'];
  expect(withToken?.concurrency).toBe(5);
  expect(withoutToken?.concurrency).toBe(1);
});

it('an unrouted queue name falls back to DEFAULT_SPEC', () => {
  expect(getSpec('scout:some_future_platform', {})).toEqual(DEFAULT_SPEC);
});
