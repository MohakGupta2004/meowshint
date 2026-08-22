import type { ScrapePlatform } from './types';

export type ScrapeErrorCode =
  | 'RATE_LIMITED'
  | 'AUTH_EXPIRED'
  | 'BLOCKED'
  | 'PROFILE_NOT_FOUND'
  | 'INVALID_TARGET'
  | 'PLATFORM_DISABLED'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'UPSTREAM_5XX'
  | 'PARSE'
  | 'NOT_IMPLEMENTED';

export interface ScrapeErrorContext {
  platform?: ScrapePlatform;
  url?: string;
  status?: number;
}

export abstract class ScrapeError extends Error {
  abstract readonly code: ScrapeErrorCode;
  abstract readonly retryable: boolean;

  constructor(
    message: string,
    readonly context?: ScrapeErrorContext
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class RateLimitError extends ScrapeError {
  readonly code = 'RATE_LIMITED' as const;
  readonly retryable = true;

  constructor(
    message: string,
    readonly retryAfterMs: number,
    context?: ScrapeErrorContext
  ) {
    super(message, context);
  }
}

export class AuthExpiredError extends ScrapeError {
  readonly code = 'AUTH_EXPIRED' as const;
  readonly retryable = false;
}

export class BlockedError extends ScrapeError {
  readonly code = 'BLOCKED' as const;
  readonly retryable = false;
}

export class ProfileNotFoundError extends ScrapeError {
  readonly code = 'PROFILE_NOT_FOUND' as const;
  readonly retryable = false;
}

export class InvalidTargetError extends ScrapeError {
  readonly code = 'INVALID_TARGET' as const;
  readonly retryable = false;
}

export class PlatformDisabledError extends ScrapeError {
  readonly code = 'PLATFORM_DISABLED' as const;
  readonly retryable = false;
}

export class TransientNetworkError extends ScrapeError {
  readonly code = 'NETWORK' as const;
  readonly retryable = true;
}

export class TimeoutError extends ScrapeError {
  readonly code = 'TIMEOUT' as const;
  readonly retryable = true;
}

export class UpstreamServerError extends ScrapeError {
  readonly code = 'UPSTREAM_5XX' as const;
  readonly retryable = true;
}

export class ParseError extends ScrapeError {
  readonly code = 'PARSE' as const;
  readonly retryable = true;
}
