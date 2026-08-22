import { expect, it, mock } from 'bun:test';

import {
  AuthExpiredError,
  ProfileNotFoundError,
  RateLimitError,
  UpstreamServerError,
} from '../../src/errors';
import { githubScraper } from '../../src/handlers/github';
import type { ScrapeDeps } from '../../src/types';
import fixture from '../fixtures/github-octocat.json';

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

function jsonRes(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

// G1
it('maps every field on the happy path', async () => {
  const fetchImpl = mock(async () => jsonRes(fixture));
  const deps = baseDeps(fetchImpl);
  const out = await githubScraper({ platform: 'GITHUB', handle: 'octocat' }, deps);
  expect(out.status).toBe('FOUND');
  const result = (out as any).result;
  expect(result.platform).toBe('GITHUB');
  expect(result.username).toBe('octocat');
  expect(result.displayName).toBe('The Octocat');
  expect(result.followers).toBe(12345);
  expect(result.following).toBe(9);
  expect(result.itemCount).toBe(8);
  expect(result.avatarUrl).toBe(fixture.avatar_url);
  expect(result.profileUrl).toBe('https://github.com/octocat');
});

// G2
it('summaryText contains formatted counts and no undefined/null', async () => {
  const fetchImpl = mock(async () => jsonRes(fixture));
  const deps = baseDeps(fetchImpl);
  const out = await githubScraper({ platform: 'GITHUB', handle: 'octocat' }, deps);
  const summary = (out as any).result.summaryText as string;
  expect(summary.includes('12,345')).toBe(true);
  expect(summary.includes('undefined')).toBe(false);
});

// G3
it('404 throws ProfileNotFoundError', async () => {
  const fetchImpl = mock(async () => new Response('', { status: 404 }));
  const deps = baseDeps(fetchImpl);
  await expect(githubScraper({ platform: 'GITHUB', handle: 'nope' }, deps)).rejects.toThrow(
    ProfileNotFoundError
  );
});

// G4
it('rate limit with reset header throws RateLimitError with correct delay', async () => {
  const resetEpoch = Math.floor(Date.now() / 1000) + 120;
  const fetchImpl = mock(
    async () =>
      new Response('', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetEpoch) },
      })
  );
  const deps = baseDeps(fetchImpl);
  try {
    await githubScraper({ platform: 'GITHUB', handle: 'octocat' }, deps);
    throw new Error('expected to throw');
  } catch (err) {
    expect(err).toBeInstanceOf(RateLimitError);
    const retryAfterMs = (err as RateLimitError).retryAfterMs;
    expect(retryAfterMs).toBeGreaterThanOrEqual(119_000);
    expect(retryAfterMs).toBeLessThanOrEqual(121_000);
  }
});

// G5
it('401 throws AuthExpiredError, not RateLimitError', async () => {
  const fetchImpl = mock(async () => new Response('', { status: 401 }));
  const deps = baseDeps(fetchImpl);
  await expect(githubScraper({ platform: 'GITHUB', handle: 'octocat' }, deps)).rejects.toThrow(
    AuthExpiredError
  );
});

// G6
it('sends the Authorization header when a token is configured', async () => {
  const fetchImpl = mock(async () => jsonRes(fixture));
  const deps = baseDeps(fetchImpl);
  deps.config.githubToken = 'ghp_x';
  await githubScraper({ platform: 'GITHUB', handle: 'octocat' }, deps);
  const call = (fetchImpl as any).mock.calls[0];
  expect(call[1].headers.authorization).toBe('Bearer ghp_x');
});

// G7
it('omits the Authorization header when no token is configured, one fetch call', async () => {
  const fetchImpl = mock(async () => jsonRes(fixture));
  const deps = baseDeps(fetchImpl);
  await githubScraper({ platform: 'GITHUB', handle: 'octocat' }, deps);
  const call = (fetchImpl as any).mock.calls[0];
  expect('authorization' in call[1].headers).toBe(false);
  expect((fetchImpl as any).mock.calls.length).toBe(1);
});

// G8
it('5xx throws UpstreamServerError', async () => {
  const fetchImpl = mock(async () => new Response('', { status: 502 }));
  const deps = baseDeps(fetchImpl);
  await expect(githubScraper({ platform: 'GITHUB', handle: 'octocat' }, deps)).rejects.toThrow(
    UpstreamServerError
  );
});

// G9
it('extracts an email from the bio', async () => {
  const fetchImpl = mock(async () => jsonRes(fixture));
  const deps = baseDeps(fetchImpl);
  const out = await githubScraper({ platform: 'GITHUB', handle: 'octocat' }, deps);
  const emails = (out as any).result.socials.discovered.emails as string[];
  expect(emails).toContain('jane@example.com');
});
