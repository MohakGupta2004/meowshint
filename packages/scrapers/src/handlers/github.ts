import { extractEmails, extractPhones } from '../extract/contacts';
import { createHttpClient } from '../http/client';
import { renderSummary } from '../render/summary';
import type { ScrapeDeps, ScrapeInput, ScrapeOutcome, ScraperHandler } from '../types';

interface GithubUser {
  login: string;
  name: string | null;
  bio: string | null;
  followers: number;
  following: number;
  public_repos: number;
  avatar_url: string;
  html_url: string;
  blog: string | null;
  twitter_username: string | null;
  company: string | null;
  location: string | null;
  email: string | null;
}

export const githubScraper: ScraperHandler = async (
  input: ScrapeInput,
  deps: ScrapeDeps
): Promise<ScrapeOutcome> => {
  const login = input.handle;
  const client = createHttpClient(deps);

  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (deps.config.githubToken) {
    headers.authorization = `Bearer ${deps.config.githubToken}`;
  }

  const { body: user } = await client.request<GithubUser>({
    url: `https://api.github.com/users/${login}`,
    platform: 'GITHUB',
    headers,
  });

  const bioAndBlog = `${user.bio ?? ''} ${user.blog ?? ''}`;
  const discoveredEmails = extractEmails(bioAndBlog);
  const discoveredPhones = extractPhones(bioAndBlog);

  const summaryText = renderSummary({
    title: `@${user.login}${user.name ? ` — ${user.name}` : ''}`,
    bio: user.bio,
    followers: user.followers,
    following: user.following,
    itemCount: user.public_repos,
    itemLabel: 'Public repos',
    links: [
      user.blog,
      user.twitter_username ? `twitter:@${user.twitter_username}` : undefined,
    ].filter((v): v is string => Boolean(v)),
    profileUrl: user.html_url,
  });

  return {
    status: 'FOUND',
    result: {
      platform: 'GITHUB',
      username: user.login,
      displayName: user.name,
      bio: user.bio,
      followers: user.followers,
      following: user.following,
      itemCount: user.public_repos,
      avatarUrl: user.avatar_url,
      profileUrl: user.html_url,
      socials: {
        blog: user.blog,
        twitter: user.twitter_username,
        company: user.company,
        location: user.location,
        email: user.email,
        discovered: { emails: discoveredEmails, phones: discoveredPhones },
      },
      raw: user,
      summaryText,
    },
  };
};
