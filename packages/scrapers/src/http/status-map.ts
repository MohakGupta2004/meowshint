import {
  AuthExpiredError,
  ProfileNotFoundError,
  RateLimitError,
  ScrapeError,
  UpstreamServerError,
} from '../errors';
import type { ScrapePlatform } from '../types';

export function httpStatusToScrapeError(
  res: Response,
  body: string,
  platform: ScrapePlatform
): ScrapeError {
  const ctx = { platform, url: res.url, status: res.status };

  if (res.status === 404) {
    return new ProfileNotFoundError('Profile not found', ctx);
  }

  if (res.status === 401) {
    return new AuthExpiredError('Authentication expired or invalid', ctx);
  }

  if (
    res.status === 429 ||
    (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')
  ) {
    const resetHeader = res.headers.get('x-ratelimit-reset');
    const retryAfterHeader = res.headers.get('retry-after');
    let retryAfterMs = 60_000;
    if (resetHeader) {
      retryAfterMs = Number(resetHeader) * 1000 - Date.now();
    } else if (retryAfterHeader) {
      retryAfterMs = Number(retryAfterHeader) * 1000;
    }
    return new RateLimitError('Rate limited', Math.max(retryAfterMs, 0), ctx);
  }

  if (res.status >= 500) {
    return new UpstreamServerError(`Upstream ${res.status}`, ctx);
  }

  return new UpstreamServerError(`Unexpected status ${res.status}: ${body.slice(0, 200)}`, ctx);
}
