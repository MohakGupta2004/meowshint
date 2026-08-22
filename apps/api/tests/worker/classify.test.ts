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
import { expect, it } from 'bun:test';

import { InsufficientCreditsError } from '../../src/errors';
import { classify } from '../../src/worker/classify';

// T26
it('RateLimitError, not final attempt -> RATE_LIMIT', () => {
  expect(classify(new RateLimitError('x', 5000), false)).toEqual({
    kind: 'RATE_LIMIT',
    retryAfterMs: 5000,
  });
});

// T27 — rate limit ignores attempts count per BullMQ docs
it('RateLimitError, final attempt -> still RATE_LIMIT', () => {
  expect(classify(new RateLimitError('x', 5000), true)).toEqual({
    kind: 'RATE_LIMIT',
    retryAfterMs: 5000,
  });
});

// T28
it('AuthExpiredError, not final -> TERMINAL_SKIP', () => {
  expect(classify(new AuthExpiredError('x'), false)).toEqual({
    kind: 'TERMINAL_SKIP',
    code: 'AUTH_EXPIRED',
  });
});

// T29 — mutation: flipping `retryable` on AuthExpiredError must break this
it('AuthExpiredError, final -> still TERMINAL_SKIP (non-retryable regardless of attempt)', () => {
  expect(classify(new AuthExpiredError('x'), true)).toEqual({
    kind: 'TERMINAL_SKIP',
    code: 'AUTH_EXPIRED',
  });
});

// T30
it('ProfileNotFoundError -> TERMINAL_MISS', () => {
  expect(classify(new ProfileNotFoundError('x'), false)).toEqual({ kind: 'TERMINAL_MISS' });
});

// T31
it('InvalidTargetError -> TERMINAL_SKIP', () => {
  expect(classify(new InvalidTargetError('x'), false)).toEqual({
    kind: 'TERMINAL_SKIP',
    code: 'INVALID_TARGET',
  });
});

// T32
it('PlatformDisabledError -> TERMINAL_SKIP', () => {
  expect(classify(new PlatformDisabledError('x'), false)).toEqual({
    kind: 'TERMINAL_SKIP',
    code: 'PLATFORM_DISABLED',
  });
});

// T33
it('TransientNetworkError, not final -> RETRY', () => {
  expect(classify(new TransientNetworkError('x'), false)).toEqual({ kind: 'RETRY' });
});

// T34
it('TransientNetworkError, final -> TERMINAL_FAIL', () => {
  expect(classify(new TransientNetworkError('x'), true)).toEqual({ kind: 'TERMINAL_FAIL' });
});

// T35
it('TimeoutError, not final -> RETRY', () => {
  expect(classify(new TimeoutError('x'), false)).toEqual({ kind: 'RETRY' });
});

// T36
it('UpstreamServerError, final -> TERMINAL_FAIL', () => {
  expect(classify(new UpstreamServerError('x'), true)).toEqual({ kind: 'TERMINAL_FAIL' });
});

// T37
it('ParseError, not final -> RETRY', () => {
  expect(classify(new ParseError('x'), false)).toEqual({ kind: 'RETRY' });
});

// T38
it('InsufficientCreditsError -> TERMINAL_SKIP with INSUFFICIENT_CREDITS code', () => {
  expect(classify(new InsufficientCreditsError(), false)).toEqual({
    kind: 'TERMINAL_SKIP',
    code: 'INSUFFICIENT_CREDITS',
  });
});

// T39
it('an unclassified plain Error, not final -> RETRY (not silently swallowed)', () => {
  expect(classify(new Error('boom'), false)).toEqual({ kind: 'RETRY' });
});

// T40
it('an unclassified plain Error, final -> TERMINAL_FAIL', () => {
  expect(classify(new Error('boom'), true)).toEqual({ kind: 'TERMINAL_FAIL' });
});
