import type { ScrapePlatform } from '../types';

const PATTERNS: Array<{ platform: ScrapePlatform; re: RegExp }> = [
  { platform: 'GITHUB', re: /github\.com\/([a-zA-Z0-9-]+)(?:\/|$)/i },
  { platform: 'INSTAGRAM', re: /instagram\.com\/([a-zA-Z0-9_.]+)(?:\/|$)/i },
  { platform: 'LINKEDIN', re: /linkedin\.com\/in\/([a-zA-Z0-9-]+)(?:\/|$)/i },
  { platform: 'TWITCH', re: /twitch\.tv\/([a-zA-Z0-9_]+)(?:\/|$)/i },
  { platform: 'YOUTUBE', re: /youtube\.com\/(?:@|c\/|channel\/)([a-zA-Z0-9_-]+)(?:\/|$)/i },
  { platform: 'TIKTOK', re: /tiktok\.com\/@([a-zA-Z0-9_.]+)(?:\/|$)/i },
  { platform: 'PINTEREST', re: /pinterest\.com\/([a-zA-Z0-9_]+)(?:\/|$)/i },
  { platform: 'LINKTREE', re: /linktr\.ee\/([a-zA-Z0-9_.]+)(?:\/|$)/i },
];

export function discoverHandles(urls: string[]): Partial<Record<ScrapePlatform, string>> {
  const found: Partial<Record<ScrapePlatform, string>> = {};

  for (const url of urls) {
    for (const { platform, re } of PATTERNS) {
      if (found[platform]) continue;
      const match = url.match(re);
      if (match?.[1]) {
        found[platform] = match[1];
      }
    }
  }

  return found;
}
