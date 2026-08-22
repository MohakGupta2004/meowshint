import { AuthExpiredError, ParseError, ProfileNotFoundError, RateLimitError } from '../errors';
import { extractEmails, extractPhones } from '../extract/contacts';
import { extractJsonLd, extractOgDescriptionCounts } from '../extract/jsonld';
import { createHttpClient } from '../http/client';
import { renderSummary } from '../render/summary';
import type { ScrapeDeps, ScrapeInput, ScrapeOutcome, ScraperHandler } from '../types';

interface Tier1User {
  username: string;
  full_name: string | null;
  biography: string | null;
  is_private: boolean;
  is_verified: boolean;
  profile_pic_url_hd: string | null;
  profile_pic_url: string | null;
  external_url: string | null;
  edge_followed_by: { count: number };
  edge_follow: { count: number };
  edge_owner_to_timeline_media: { count: number };
  bio_links?: Array<{ url: string }>;
}

function isLoginRedirect(res: Response): boolean {
  const isRedirect = res.status >= 300 && res.status < 400;
  if (!isRedirect) return false;
  const location = res.headers.get('location') ?? '';
  return location.includes('/accounts/login/');
}

async function checkRateLimitText(res: Response, text: string): Promise<void> {
  if (res.status === 429 || text.includes('Please wait a few minutes')) {
    throw new RateLimitError('Instagram rate limited', 15 * 60 * 1000, {
      platform: 'INSTAGRAM',
      status: res.status,
    });
  }
}

export const instagramScraper: ScraperHandler = async (
  input: ScrapeInput,
  deps: ScrapeDeps
): Promise<ScrapeOutcome> => {
  const username = input.handle;
  const client = createHttpClient(deps);

  const tier1Res = await client.requestRaw({
    url: `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
    platform: 'INSTAGRAM',
    headers: { 'x-ig-app-id': '936619743392459', accept: '*/*' },
  });

  if (isLoginRedirect(tier1Res)) {
    throw new AuthExpiredError('Instagram login wall', { platform: 'INSTAGRAM' });
  }

  if (tier1Res.status === 200) {
    const text = await tier1Res.text();
    await checkRateLimitText(tier1Res, text);
    try {
      const parsed = JSON.parse(text) as { data?: { user?: Tier1User } };
      const user = parsed.data?.user;
      if (user) {
        return buildFromTier1(user);
      }
    } catch {
      // Non-JSON tier-1 body — fall through to the tier-2 HTML fallback below.
    }
  } else if (tier1Res.status === 404) {
    throw new ProfileNotFoundError('Profile not found', { platform: 'INSTAGRAM' });
  } else if (tier1Res.status === 429) {
    const text = await tier1Res.text();
    await checkRateLimitText(tier1Res, text);
  }
  // any other non-200 (typically 401) falls through to the tier-2 HTML fallback

  const tier2Res = await client.requestRaw({
    url: `https://www.instagram.com/${username}/`,
    platform: 'INSTAGRAM',
  });

  if (isLoginRedirect(tier2Res)) {
    throw new AuthExpiredError('Instagram login wall', { platform: 'INSTAGRAM' });
  }

  const html = await tier2Res.text();
  await checkRateLimitText(tier2Res, html);

  if (tier2Res.status === 404 || html.includes("Sorry, this page isn't available")) {
    throw new ProfileNotFoundError('Profile not found', { platform: 'INSTAGRAM' });
  }

  const jsonLd = extractJsonLd(html);
  const counts = extractOgDescriptionCounts(html);

  if (!jsonLd && !counts) {
    throw new ParseError('Could not parse Instagram profile HTML', { platform: 'INSTAGRAM' });
  }

  const biography = jsonLd?.description ?? '';
  const summaryText = renderSummary({
    title: `@${username}${jsonLd?.name ? ` — ${jsonLd.name}` : ''}`,
    bio: biography,
    followers: counts?.followers,
    following: counts?.following,
    itemCount: counts?.posts,
    itemLabel: 'Posts',
    profileUrl: `https://www.instagram.com/${username}/`,
  });

  return {
    status: 'FOUND',
    result: {
      username,
      fullName: jsonLd?.name ?? null,
      biography,
      followers: counts?.followers ?? null,
      following: counts?.following ?? null,
      postCount: counts?.posts ?? null,
      isPrivate: false,
      isVerified: false,
      avatarUrl: null,
      externalUrl: null,
      extractedEmails: extractEmails(biography),
      extractedPhones: extractPhones(biography),
      summaryText,
      raw: { source: 'html', jsonLd, og: counts },
    },
  };
};

function buildFromTier1(user: Tier1User): ScrapeOutcome {
  const bio = user.biography ?? '';
  const summaryText = renderSummary({
    title: `@${user.username}${user.full_name ? ` — ${user.full_name}` : ''}`,
    bio,
    followers: user.edge_followed_by.count,
    following: user.edge_follow.count,
    itemCount: user.edge_owner_to_timeline_media.count,
    itemLabel: 'Posts',
    profileUrl: `https://www.instagram.com/${user.username}/`,
  });

  return {
    status: 'FOUND',
    result: {
      username: user.username,
      fullName: user.full_name,
      biography: user.biography,
      followers: user.edge_followed_by.count,
      following: user.edge_follow.count,
      postCount: user.edge_owner_to_timeline_media.count,
      isPrivate: user.is_private,
      isVerified: user.is_verified,
      avatarUrl: user.profile_pic_url_hd ?? user.profile_pic_url,
      externalUrl: user.external_url,
      extractedEmails: extractEmails(`${bio} ${user.bio_links?.map((l) => l.url).join(' ') ?? ''}`),
      extractedPhones: extractPhones(bio),
      summaryText,
      raw: user,
    },
  };
}
