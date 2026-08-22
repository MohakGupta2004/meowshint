import { describe, expect, it } from 'bun:test';

import { extractEmails, extractPhones } from '../../src/extract/contacts';

// E1
it('extracts a plain email', () => {
  expect(extractEmails('contact: jane@example.com')).toEqual(['jane@example.com']);
  expect(extractPhones('contact: jane@example.com')).toEqual([]);
});

// E2
it('extracts an obfuscated "(at)/(dot)" email', () => {
  expect(extractEmails('jane (at) example (dot) com')).toEqual(['jane@example.com']);
});

// E3
it('extracts a phone number', () => {
  expect(extractEmails('call 555-123-4567')).toEqual([]);
  expect(extractPhones('call 555-123-4567')).toEqual(['555-123-4567']);
});

// E4 — mutation: removing the negative lookbehind/lookahead on PHONE_RE breaks this
it('does not match a version string as a phone number', () => {
  expect(extractPhones('v2.1.4 released')).toEqual([]);
});

// E5
it('returns empty arrays when there is no contact info', () => {
  expect(extractEmails('no contact info here')).toEqual([]);
  expect(extractPhones('no contact info here')).toEqual([]);
});

// E6
it('extracts multiple emails in order', () => {
  expect(extractEmails('reach me: a@b.com or c@d.org')).toEqual(['a@b.com', 'c@d.org']);
});
