import { expect, it } from 'bun:test';

import { JOB_SCHEMA_VERSION, jobDataSchema } from '../../src/worker/contracts';

const base = {
  schemaVersion: JOB_SCHEMA_VERSION,
  sessionId: 's1',
  taskId: 't1',
  agentId: 7,
  enqueuedAt: '2026-01-01T00:00:00Z',
};

// T41
it('accepts a valid WEB_SEARCH job', () => {
  const input = { ...base, kind: 'WEB_SEARCH', query: 'jane doe' };
  const parsed = jobDataSchema.parse(input);
  expect(parsed.kind).toBe('WEB_SEARCH');
});

// T42
it('accepts a valid SCRAPE job', () => {
  const input = {
    ...base,
    kind: 'SCRAPE',
    platform: 'GITHUB',
    target: { displayName: 'Jane' },
  };
  expect(() => jobDataSchema.parse(input)).not.toThrow();
});

// T43
it('rejects the wrong schemaVersion', () => {
  const input = { ...base, schemaVersion: 2, kind: 'WEB_SEARCH', query: 'x' };
  expect(() => jobDataSchema.parse(input)).toThrow();
});

// T44
it('rejects a SCRAPE job with platform WEB_SEARCH', () => {
  const input = {
    ...base,
    kind: 'SCRAPE',
    platform: 'WEB_SEARCH',
    target: { displayName: 'Jane' },
  };
  expect(() => jobDataSchema.parse(input)).toThrow();
});

// T45
it('rejects a job missing taskId', () => {
  const { taskId: _taskId, ...rest } = base;
  const input = { ...rest, kind: 'WEB_SEARCH', query: 'x' };
  expect(() => jobDataSchema.parse(input)).toThrow();
});

// T46
it('rejects an unknown kind', () => {
  const input = { ...base, kind: 'DELETE_EVERYTHING' };
  expect(() => jobDataSchema.parse(input)).toThrow();
});
