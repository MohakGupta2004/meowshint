import { expect, it, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AuthExpiredError,
  ParseError,
  ProfileNotFoundError,
  RateLimitError,
} from '../../src/errors';
import { instagramScraper } from '../../src/handlers/instagram';
import type { ScrapeDeps } from '../../src/types';
import tier1Fixture from '../fixtures/instagram-tier1.json';

const tier2Html = readFileSync(join(import.meta.dir, '../fixtures/instagram-profile.html'), 'utf8');

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
function textRes(body: string, status = 200) {
  return new Response(body, { status });
}

// I1
it('tier-1 happy path maps every InstagramResult field', async () => {
  const fetchImpl = mock(async () => jsonRes(tier1Fixture));
  const deps = baseDeps(fetchImpl);
  const out = await instagramScraper({ platform: 'INSTAGRAM', handle: 'octocat_ig' }, deps);
  const r = (out as any).result;
  const u = tier1Fixture.data.user;
  expect(r.username).toBe(u.username);
  expect(r.fullName).toBe(u.full_name);
  expect(r.biography).toBe(u.biography);
  expect(r.followers).toBe(u.edge_followed_by.count);
  expect(r.following).toBe(u.edge_follow.count);
  expect(r.postCount).toBe(u.edge_owner_to_timeline_media.count);
  expect(r.isPrivate).toBe(u.is_private);
  expect(r.isVerified).toBe(u.is_verified);
  expect(r.avatarUrl).toBe(u.profile_pic_url_hd);
});

// I2
it('tier-1 401 falls back to tier-2 and still returns FOUND', async () => {
  let call = 0;
  const fetchImpl = mock(async (url: string) => {
    call += 1;
    if (call === 1) return new Response('', { status: 401 });
    return textRes(tier2Html);
  });
  const deps = baseDeps(fetchImpl as any);
  const out = await instagramScraper({ platform: 'INSTAGRAM', handle: 'octocat_ig' }, deps);
  expect((fetchImpl as any).mock.calls.length).toBe(2);
  const secondUrl = (fetchImpl as any).mock.calls[1][0];
  expect(secondUrl).toBe('https://www.instagram.com/octocat_ig/');
  expect(out.status).toBe('FOUND');
});

// I3
it('tier-2 JSON-LD + og:description parse correctly', async () => {
  let call = 0;
  const fetchImpl = mock(async () => {
    call += 1;
    if (call === 1) return new Response('', { status: 401 });
    return textRes(tier2Html);
  });
  const deps = baseDeps(fetchImpl as any);
  const out = await instagramScraper({ platform: 'INSTAGRAM', handle: 'octocat_ig' }, deps);
  const r = (out as any).result;
  expect(r.followers).toBe(1234);
  expect(r.fullName).toBe('Jane Doe');
});

// I4
it('a private profile is FOUND, not NOT_FOUND', async () => {
  const privateFixture = {
    data: { user: { ...tier1Fixture.data.user, is_private: true } },
  };
  const fetchImpl = mock(async () => jsonRes(privateFixture));
  const deps = baseDeps(fetchImpl);
  const out = await instagramScraper({ platform: 'INSTAGRAM', handle: 'octocat_ig' }, deps);
  expect(out.status).toBe('FOUND');
  const r = (out as any).result;
  expect(r.isPrivate).toBe(true);
  expect(r.followers).toBe(tier1Fixture.data.user.edge_followed_by.count);
});

// I5
it('login-wall redirect throws AuthExpiredError with no tier-2 attempt', async () => {
  const fetchImpl = mock(
    async () =>
      new Response('', {
        status: 302,
        headers: { location: 'https://instagram.com/accounts/login/' },
      })
  );
  const deps = baseDeps(fetchImpl);
  await expect(
    instagramScraper({ platform: 'INSTAGRAM', handle: 'octocat_ig' }, deps)
  ).rejects.toThrow(AuthExpiredError);
  expect((fetchImpl as any).mock.calls.length).toBe(1);
});

// I6
it('"please wait" body throws RateLimitError with a 15 minute delay', async () => {
  const fetchImpl = mock(async () =>
    textRes('Please wait a few minutes before you try again.', 200)
  );
  const deps = baseDeps(fetchImpl);
  try {
    await instagramScraper({ platform: 'INSTAGRAM', handle: 'octocat_ig' }, deps);
    throw new Error('expected to throw');
  } catch (err) {
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfterMs).toBe(900_000);
  }
});

// I7
it('429 throws RateLimitError', async () => {
  const fetchImpl = mock(async () => textRes('', 429));
  const deps = baseDeps(fetchImpl);
  await expect(
    instagramScraper({ platform: 'INSTAGRAM', handle: 'octocat_ig' }, deps)
  ).rejects.toThrow(RateLimitError);
});

// I8
it('404 throws ProfileNotFoundError', async () => {
  const fetchImpl = mock(async () => textRes('', 404));
  const deps = baseDeps(fetchImpl);
  await expect(instagramScraper({ platform: 'INSTAGRAM', handle: 'nope' }, deps)).rejects.toThrow(
    ProfileNotFoundError
  );
});

// I9
it('extracts emails/phones from the biography', async () => {
  const fetchImpl = mock(async () => jsonRes(tier1Fixture));
  const deps = baseDeps(fetchImpl);
  const out = await instagramScraper({ platform: 'INSTAGRAM', handle: 'octocat_ig' }, deps);
  const r = (out as any).result;
  expect(r.extractedEmails).toContain('jane@x.com');
});

// I10
it('unparseable HTML on both tiers throws ParseError', async () => {
  let call = 0;
  const fetchImpl = mock(async () => {
    call += 1;
    if (call === 1) return textRes('not json at all', 200);
    return textRes('<html><body>nothing useful here</body></html>', 200);
  });
  const deps = baseDeps(fetchImpl as any);
  await expect(
    instagramScraper({ platform: 'INSTAGRAM', handle: 'octocat_ig' }, deps)
  ).rejects.toThrow(ParseError);
});
