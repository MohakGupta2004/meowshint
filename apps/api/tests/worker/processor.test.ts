import { RateLimitError } from '@repo/scrapers/errors';
import { expect, it, mock } from 'bun:test';

import type { ScrapeJobData } from '../../src/worker/contracts';
import { processTask } from '../../src/worker/processor';

function baseTaskRunner() {
  return {
    claim: mock(async () => ({
      ok: true,
      ctx: { taskId: 't1', platform: 'GITHUB', sessionId: 's1', agentId: 1 },
    })),
    finish: mock(async () => {}),
    fail: mock(async () => {}),
    skip: mock(async () => {}),
    notFound: mock(async () => {}),
    release: mock(async () => {}),
  };
}

function baseDeps(overrides: Partial<Parameters<typeof processTask>[1]> = {}) {
  return {
    getHandler: mock(() => undefined),
    buildScrapeDeps: mock(() => ({}) as any),
    taskRunner: baseTaskRunner() as any,
    worker: { rateLimit: mock(async () => {}) } as any,
    RateLimitError: mock(() => new Error('rate limited')) as any,
    isFinalAttempt: mock(() => false),
    ...overrides,
  };
}

const scrapeJob: ScrapeJobData = {
  schemaVersion: 1,
  kind: 'SCRAPE',
  sessionId: 's1',
  taskId: 't1',
  agentId: 1,
  enqueuedAt: new Date().toISOString(),
  platform: 'GITHUB',
  target: { displayName: 'Jane Doe' },
};

// P1
it('claim fails -> handler never called', async () => {
  const handler = mock(async () => ({ status: 'FOUND', result: {} }) as any);
  const deps = baseDeps({
    getHandler: mock(() => handler),
    taskRunner: {
      ...baseTaskRunner(),
      claim: mock(async () => ({ ok: false, reason: 'NOT_CLAIMABLE' })),
    } as any,
  });
  await processTask(scrapeJob, deps);
  expect(handler).not.toHaveBeenCalled();
});

// P2
it('handler throws RateLimitError -> finish/fail never called, rateLimit called with delay, throws Worker.RateLimitError', async () => {
  const handler = mock(async () => {
    throw new RateLimitError('rate limited', 5000);
  });
  const taskRunner = baseTaskRunner();
  const deps = baseDeps({ getHandler: mock(() => handler), taskRunner: taskRunner as any });

  await expect(processTask(scrapeJob, deps)).rejects.toThrow('rate limited');
  expect(taskRunner.finish).not.toHaveBeenCalled();
  expect(taskRunner.fail).not.toHaveBeenCalled();
  expect(deps.worker.rateLimit).toHaveBeenCalledWith(5000);
  expect(deps.RateLimitError).toHaveBeenCalled();
});

// P3
it('handler resolves FOUND -> finish called with that outcome', async () => {
  const outcome = { status: 'FOUND', result: { username: 'octocat' } };
  const handler = mock(async () => outcome as any);
  const taskRunner = baseTaskRunner();
  const deps = baseDeps({ getHandler: mock(() => handler), taskRunner: taskRunner as any });

  await processTask(scrapeJob, deps);
  expect(taskRunner.finish).toHaveBeenCalledWith('t1', outcome);
});

// P4
it('no handler for platform -> skip with NOT_IMPLEMENTED', async () => {
  const taskRunner = baseTaskRunner();
  const deps = baseDeps({ getHandler: mock(() => undefined), taskRunner: taskRunner as any });
  await processTask(scrapeJob, deps);
  expect(taskRunner.skip).toHaveBeenCalled();
  expect((taskRunner.skip as any).mock.calls[0][2]).toBe('NOT_IMPLEMENTED');
});
