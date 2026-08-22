import { expect, it } from 'bun:test';

import { renderSummary } from '../../src/render/summary';

// R1
it('omits a line whose data is absent', () => {
  const out = renderSummary({ title: 'octocat', followers: undefined });
  expect(out.includes('Followers')).toBe(false);
});

// R2
it('never emits the literal string "undefined" or "null"', () => {
  const out = renderSummary({ title: 'octocat', bio: null, followers: null, profileUrl: null });
  expect(out.includes('undefined')).toBe(false);
  expect(out.includes('null')).toBe(false);
});

// R3
it('clamps bio to 280 chars with an ellipsis', () => {
  const out = renderSummary({ title: 'octocat', bio: 'x'.repeat(500) });
  const bioLine = out.split('\n').find((l) => l.startsWith('Bio: '))!;
  expect(bioLine.length).toBeLessThanOrEqual(284 + 'Bio: '.length);
  expect(bioLine.endsWith('…')).toBe(true);
});

// R4
it('formats counts with locale separators', () => {
  const out = renderSummary({ title: 'octocat', followers: 12345 });
  expect(out.includes('12,345')).toBe(true);
  expect(out.includes('12345')).toBe(false);
});
