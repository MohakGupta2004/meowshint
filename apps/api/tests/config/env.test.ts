import { expect, it } from 'bun:test';

import { parseEnv } from '../../src/config/env';

const requiredBase = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
};

// T50 — mutation: reverting to bare z.coerce.boolean() must break this
it('ENABLE_LINKEDIN_SCRAPER="false" coerces to false', () => {
  const env = parseEnv({ ...requiredBase, ENABLE_LINKEDIN_SCRAPER: 'false' });
  expect(env.ENABLE_LINKEDIN_SCRAPER).toBe(false);
});

// T51
it('ENABLE_LINKEDIN_SCRAPER defaults to false when unset', () => {
  const env = parseEnv({ ...requiredBase });
  expect(env.ENABLE_LINKEDIN_SCRAPER).toBe(false);
});

// T52
it('RUN_WORKER defaults to false when unset', () => {
  const env = parseEnv({ ...requiredBase });
  expect(env.RUN_WORKER).toBe(false);
});

// T53 — only testable once process.exit(1) is replaced with a throw
it('invalid env throws instead of exiting the process', () => {
  expect(() => parseEnv({})).toThrow();
});

// T54
it('SCOUT_FREE_PROXY="false" coerces to the boolean false, not the truthy string', () => {
  const env = parseEnv({ ...requiredBase, SCOUT_FREE_PROXY: 'false' });
  expect(env.SCOUT_FREE_PROXY).toBe(false);
});

it('RUN_API defaults to true when unset (single-process default)', () => {
  const env = parseEnv({ ...requiredBase });
  expect(env.RUN_API).toBe(true);
});
