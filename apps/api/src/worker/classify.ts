import {
  AuthExpiredError,
  BlockedError,
  InvalidTargetError,
  ParseError,
  PlatformDisabledError,
  ProfileNotFoundError,
  RateLimitError,
  TimeoutError,
  TransientNetworkError,
  UpstreamServerError,
} from '@repo/scrapers/errors';

import { InsufficientCreditsError } from '../errors';

export type Disposition =
  | { kind: 'RATE_LIMIT'; retryAfterMs: number }
  | { kind: 'TERMINAL_SKIP'; code: string }
  | { kind: 'TERMINAL_MISS' }
  | { kind: 'RETRY' }
  | { kind: 'TERMINAL_FAIL' };

// Pure — no I/O, no mocks needed. isFinalAttempt only matters for the
// generically-retryable branch; a RateLimitError ignores attempts entirely
// (per BullMQ: manual rate limiting is not treated as a standard failure),
// and every explicitly non-retryable ScrapeError is terminal regardless of attempt.
export function classify(err: unknown, isFinalAttempt: boolean): Disposition {
  if (err instanceof RateLimitError) {
    return { kind: 'RATE_LIMIT', retryAfterMs: err.retryAfterMs };
  }

  if (
    err instanceof AuthExpiredError ||
    err instanceof BlockedError ||
    err instanceof PlatformDisabledError
  ) {
    return { kind: 'TERMINAL_SKIP', code: err.code };
  }

  if (err instanceof ProfileNotFoundError) {
    return { kind: 'TERMINAL_MISS' };
  }

  if (err instanceof InvalidTargetError) {
    return { kind: 'TERMINAL_SKIP', code: err.code };
  }

  if (err instanceof InsufficientCreditsError) {
    return { kind: 'TERMINAL_SKIP', code: 'INSUFFICIENT_CREDITS' };
  }

  if (
    err instanceof TransientNetworkError ||
    err instanceof TimeoutError ||
    err instanceof UpstreamServerError ||
    err instanceof ParseError
  ) {
    return isFinalAttempt ? { kind: 'TERMINAL_FAIL' } : { kind: 'RETRY' };
  }

  // Unknown errors are retryable by default, not silently swallowed.
  return isFinalAttempt ? { kind: 'TERMINAL_FAIL' } : { kind: 'RETRY' };
}
