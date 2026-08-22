import { afterEach, beforeEach, expect, it, mock } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createHttpClient } from '../../src/http/client';
import { __resetProxyFileCacheForTests } from '../../src/http/proxy';
import { USER_AGENTS } from '../../src/http/user-agents';
import type { ScrapeDeps } from '../../src/types';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

function baseDeps(overrides: Partial<ScrapeDeps> = {}): ScrapeDeps {
  return {
    fetchImpl: mock(async () => jsonResponse({ ok: true })),
    sleep: mock(async () => {}),
    random: () => 0,
    now: () => new Date('2026-01-01T00:00:00Z'),
    logger: { debug: mock(), warn: mock(), error: mock() },
    config: {
      delayMinMs: 500,
      delayMaxMs: 4000,
      timeoutMs: 5000,
      maxCandidates: 10,
    },
    ...overrides,
  };
}

beforeEach(() => __resetProxyFileCacheForTests());
afterEach(() => __resetProxyFileCacheForTests());

// H1
it('draws the UA from the fixed pool deterministically', async () => {
  const deps = baseDeps({ random: () => 0 });
  const client = createHttpClient(deps);
  await client.request({ url: 'https://example.com', platform: 'GITHUB' });
  const call = (deps.fetchImpl as any).mock.calls[0];
  expect(call[1].headers['user-agent']).toBe(USER_AGENTS[0]);
});

// H2
it('sleeps a value inside the configured delay range', async () => {
  const deps = baseDeps({ random: () => 0.5 });
  const client = createHttpClient(deps);
  await client.request({ url: 'https://example.com', platform: 'GITHUB' });
  const sleptMs = (deps.sleep as any).mock.calls[0][0];
  expect(sleptMs).toBeGreaterThanOrEqual(500);
  expect(sleptMs).toBeLessThanOrEqual(4000);
});

// H3
it('skipDelay skips the sleep call', async () => {
  const deps = baseDeps();
  const client = createHttpClient(deps);
  await client.request({ url: 'https://example.com', platform: 'GITHUB', skipDelay: true });
  expect((deps.sleep as any).mock.calls.length).toBe(0);
});

// H4
it('SCOUT_PROXY wins over SCOUT_PROXY_FILE', async () => {
  const tmpFile = path.join(os.tmpdir(), `proxy-list-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, 'http://file-proxy:8080\n');
  const deps = baseDeps({
    config: {
      delayMinMs: 0,
      delayMaxMs: 0,
      timeoutMs: 5000,
      maxCandidates: 10,
      proxy: 'http://direct-proxy:8080',
      proxyFile: tmpFile,
    },
  });
  const client = createHttpClient(deps);
  await client.request({ url: 'https://example.com', platform: 'GITHUB' });
  const call = (deps.fetchImpl as any).mock.calls[0];
  expect(call[1].proxy).toBe('http://direct-proxy:8080');
  fs.unlinkSync(tmpFile);
});

// H5
it('SCOUT_PROXY_FILE wins over SCOUT_FREE_PROXY', async () => {
  const tmpFile = path.join(os.tmpdir(), `proxy-list-${Date.now()}-2.txt`);
  fs.writeFileSync(tmpFile, 'http://file-proxy:9090\n');
  const deps = baseDeps({
    config: {
      delayMinMs: 0,
      delayMaxMs: 0,
      timeoutMs: 5000,
      maxCandidates: 10,
      proxyFile: tmpFile,
      freeProxy: true,
    },
  });
  const client = createHttpClient(deps);
  await client.request({ url: 'https://example.com', platform: 'GITHUB' });
  const call = (deps.fetchImpl as any).mock.calls[0];
  expect(call[1].proxy).toBe('http://file-proxy:9090');
  fs.unlinkSync(tmpFile);
});

// H6
it('omits the proxy option entirely when none is configured', async () => {
  const deps = baseDeps();
  const client = createHttpClient(deps);
  await client.request({ url: 'https://example.com', platform: 'GITHUB' });
  const call = (deps.fetchImpl as any).mock.calls[0];
  expect('proxy' in call[1]).toBe(false);
});

// H7
it('always requests with redirect: manual', async () => {
  const deps = baseDeps();
  const client = createHttpClient(deps);
  await client.request({ url: 'https://example.com', platform: 'GITHUB' });
  const call = (deps.fetchImpl as any).mock.calls[0];
  expect(call[1].redirect).toBe('manual');
});

// H8
it('wraps every request with an AbortSignal', async () => {
  const deps = baseDeps();
  const client = createHttpClient(deps);
  await client.request({ url: 'https://example.com', platform: 'GITHUB' });
  const call = (deps.fetchImpl as any).mock.calls[0];
  expect(call[1].signal instanceof AbortSignal).toBe(true);
});
