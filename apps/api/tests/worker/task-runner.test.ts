import { afterEach, beforeEach, expect, it, mock, spyOn } from 'bun:test';

import { InsufficientCreditsError } from '../../src/errors';
import { creditsService } from '../../src/modules/credits/service';
import { sessionsService } from '../../src/modules/sessions/service';
import { taskRunner } from '../../src/modules/sessions/task-runner';
import { makePrismaMock } from '../helpers/prisma-mock';

function makeTask(overrides: any = {}) {
  return {
    id: 't1',
    sessionId: 's1',
    platform: 'GITHUB',
    status: 'PENDING',
    chargedAt: null,
    attempts: 0,
    startedAt: null,
    session: {
      id: 's1',
      agentId: 7,
      lockedAt: null,
      status: 'ENRICHING',
    },
    ...overrides,
  };
}

const txMock: any = {
  sessionTask: {
    updateMany: mock(async () => ({ count: 1 })),
    update: mock(),
    findUniqueOrThrow: mock(async () => makeTask()),
    create: mock(),
  },
  osintSession: { update: mock() },
  candidate: { deleteMany: mock(), createMany: mock() },
  webSearchResult: { upsert: mock() },
  instagramResult: { upsert: mock() },
  linkedInResult: { upsert: mock() },
  socialProfileResult: { upsert: mock() },
};

mock.module('../../src/lib/prisma', () => {
  const prismaMock: any = makePrismaMock({
    $transaction: mock(async (cb: any) => cb(txMock)),
  });
  return { prisma: prismaMock, connectDatabase: mock(), disconnectDatabase: mock() };
});

let spendSpy: ReturnType<typeof spyOn>;
let refundSpy: ReturnType<typeof spyOn>;
let completionSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  txMock.sessionTask.updateMany.mockClear();
  txMock.sessionTask.updateMany.mockImplementation(async () => ({ count: 1 }));
  txMock.sessionTask.update.mockClear();
  txMock.sessionTask.findUniqueOrThrow.mockClear();
  txMock.sessionTask.findUniqueOrThrow.mockImplementation(async () => makeTask());
  txMock.osintSession.update.mockClear();
  txMock.candidate.deleteMany.mockClear();
  txMock.candidate.createMany.mockClear();
  txMock.webSearchResult.upsert.mockClear();
  txMock.instagramResult.upsert.mockClear();
  txMock.linkedInResult.upsert.mockClear();
  txMock.socialProfileResult.upsert.mockClear();

  spendSpy = spyOn(creditsService, 'spend').mockResolvedValue({ balanceAfter: 90 } as any);
  refundSpy = spyOn(creditsService, 'refund').mockResolvedValue({ balanceAfter: 100 } as any);
  completionSpy = spyOn(sessionsService, 'checkSessionCompletion').mockResolvedValue(
    undefined as any
  );
});

afterEach(() => {
  spendSpy.mockRestore();
  refundSpy.mockRestore();
  completionSpy.mockRestore();
});

// --- claim() ---------------------------------------------------------------

// T1
it('T1: claims a PENDING task', async () => {
  const result = await taskRunner.claim('t1', { expectAgentId: 7, staleAfterMs: 600_000 });
  expect(result.ok).toBe(true);
  const call = txMock.sessionTask.updateMany.mock.calls[0][0];
  expect(call.where.id).toBe('t1');
  expect(call.where.OR).toContainEqual({ status: 'PENDING' });
});

// T2 — mutation: updateMany -> update in claim breaks this
it('T2: claim of an already-claimed task fails cleanly, no charge', async () => {
  txMock.sessionTask.updateMany.mockImplementation(async () => ({ count: 0 }));
  const result = await taskRunner.claim('t1', { expectAgentId: 7, staleAfterMs: 600_000 });
  expect(result).toEqual({ ok: false, reason: 'NOT_CLAIMABLE' });
  expect(spendSpy).not.toHaveBeenCalled();
});

// T3
it('T3: stale-RUNNING reclaim is offered in the where clause', async () => {
  await taskRunner.claim('t1', { expectAgentId: 7, staleAfterMs: 600_000 });
  const call = txMock.sessionTask.updateMany.mock.calls[0][0];
  const staleBranch = call.where.OR.find((o: any) => o.status === 'RUNNING');
  expect(staleBranch).toBeDefined();
  expect(staleBranch.startedAt.lt).toBeInstanceOf(Date);
});

// T4
it('T4: charges exactly once on first claim, GITHUB costs 10', async () => {
  await taskRunner.claim('t1', { expectAgentId: 7, staleAfterMs: 600_000 });
  expect(spendSpy).toHaveBeenCalledTimes(1);
  expect(spendSpy).toHaveBeenCalledWith(
    txMock,
    7,
    10,
    expect.objectContaining({
      sessionId: 's1',
      taskId: 't1',
      platform: 'GITHUB',
      kind: 'SCRAPE',
      reason: 'GITHUB scrape',
    })
  );
  expect(txMock.sessionTask.update).toHaveBeenCalledWith({
    where: { id: 't1' },
    data: { chargedAt: expect.any(Date) },
  });
});

// T5
it('T5: WEB_SEARCH charges kind WEB_SEARCH at cost 5', async () => {
  txMock.sessionTask.findUniqueOrThrow.mockImplementation(async () =>
    makeTask({ platform: 'WEB_SEARCH' })
  );
  await taskRunner.claim('t1', { expectAgentId: 7, staleAfterMs: 600_000 });
  expect(spendSpy).toHaveBeenCalledWith(
    txMock,
    7,
    5,
    expect.objectContaining({ kind: 'WEB_SEARCH', reason: 'WEB_SEARCH scrape' })
  );
});

// T6 — mutation: deleting the chargedAt===null guard breaks this
it('T6: an already-charged task is not re-charged', async () => {
  txMock.sessionTask.findUniqueOrThrow.mockImplementation(async () =>
    makeTask({ chargedAt: new Date('2026-01-01') })
  );
  await taskRunner.claim('t1', { expectAgentId: 7, staleAfterMs: 600_000 });
  expect(spendSpy).not.toHaveBeenCalled();
});

// T7
it('T7: agent mismatch throws, no writes', async () => {
  txMock.sessionTask.findUniqueOrThrow.mockImplementation(async () => makeTask());
  await expect(
    taskRunner.claim('t1', { expectAgentId: 999, staleAfterMs: 600_000 })
  ).rejects.toThrow();
  expect(spendSpy).not.toHaveBeenCalled();
});

// T8
it('T8: locked session refuses claim, no charge', async () => {
  txMock.sessionTask.findUniqueOrThrow.mockImplementation(async () =>
    makeTask({ session: { id: 's1', agentId: 7, lockedAt: new Date(), status: 'ENRICHING' } })
  );
  const result = await taskRunner.claim('t1', { expectAgentId: 7, staleAfterMs: 600_000 });
  expect(result).toEqual({ ok: false, reason: 'SESSION_LOCKED' });
  expect(spendSpy).not.toHaveBeenCalled();
});

// T9
it('T9: insufficient credits resolves ok:false, does not throw past the caller', async () => {
  spendSpy.mockImplementation(async () => {
    throw new InsufficientCreditsError();
  });
  const result = await taskRunner.claim('t1', { expectAgentId: 7, staleAfterMs: 600_000 });
  expect(result).toEqual({ ok: false, reason: 'INSUFFICIENT_CREDITS' });
});

// --- finish() ----------------------------------------------------------------

// T10
it('T10: FOUND upserts the correct result table', async () => {
  await taskRunner.finish('t1', {
    status: 'FOUND',
    result: { username: 'octocat', followers: 100 },
  });
  expect(txMock.socialProfileResult.upsert).toHaveBeenCalledTimes(1);
  const call = txMock.socialProfileResult.upsert.mock.calls[0][0];
  expect(call.where).toEqual({ taskId: 't1' });
  expect(call.create).toMatchObject({
    taskId: 't1',
    platform: 'GITHUB',
    username: 'octocat',
    followers: 100,
  });
});

// T11
it('T11: FOUND transitions the task and increments completedTasks', async () => {
  await taskRunner.finish('t1', { status: 'FOUND', result: {} });
  const updateCall = txMock.sessionTask.updateMany.mock.calls[0][0];
  expect(updateCall.where).toEqual({ id: 't1', status: 'RUNNING' });
  expect(updateCall.data.status).toBe('FOUND');
  expect(txMock.osintSession.update).toHaveBeenCalledWith({
    where: { id: 's1' },
    data: { completedTasks: { increment: 1 } },
  });
});

// T12 — mutation: removing the moved.count===0 early return breaks this
it('T12: a second finish() after the task is already terminal is a no-op', async () => {
  txMock.sessionTask.updateMany.mockImplementation(async () => ({ count: 0 }));
  await taskRunner.finish('t1', { status: 'FOUND', result: {} });
  expect(txMock.osintSession.update).not.toHaveBeenCalled();
  expect(txMock.socialProfileResult.upsert).toHaveBeenCalledTimes(1); // upsert is safe to repeat
});

// T13
it('T13: NOT_FOUND increments completedTasks, writes no result', async () => {
  await taskRunner.finish('t1', { status: 'NOT_FOUND', reason: 'no such user' });
  expect(txMock.socialProfileResult.upsert).not.toHaveBeenCalled();
  const updateCall = txMock.sessionTask.updateMany.mock.calls[0][0];
  expect(updateCall.data.status).toBe('NOT_FOUND');
  expect(txMock.osintSession.update).toHaveBeenCalledWith({
    where: { id: 's1' },
    data: { completedTasks: { increment: 1 } },
  });
});

// T14
it('T14: SKIPPED counts toward neither completedTasks nor failedTasks', async () => {
  await taskRunner.finish('t1', { status: 'SKIPPED', reason: 'x', errorCode: 'AUTH_EXPIRED' });
  expect(txMock.osintSession.update).not.toHaveBeenCalled();
});

// T15
it('T15: candidates are replaced idempotently with dense ranks', async () => {
  await taskRunner.finish('t1', {
    status: 'FOUND',
    result: {},
    candidates: [
      { displayName: 'A', rank: 0 },
      { displayName: 'B', rank: 1 },
    ],
  });
  expect(txMock.candidate.deleteMany).toHaveBeenCalledWith({
    where: { sessionId: 's1', selected: false },
  });
  const createCall = txMock.candidate.createMany.mock.calls[0][0];
  expect(createCall.data.length).toBe(2);
  expect(createCall.data.map((c: any) => c.rank)).toEqual([0, 1]);
});

// T16 — mutation: 'ENRICHING' -> true in the phase guard breaks this
it('T16: DISAMBIGUATION session does not trigger the completion check', async () => {
  txMock.sessionTask.findUniqueOrThrow.mockImplementation(async () =>
    makeTask({ session: { id: 's1', agentId: 7, lockedAt: null, status: 'DISAMBIGUATION' } })
  );
  await taskRunner.finish('t1', { status: 'FOUND', result: {} });
  expect(completionSpy).not.toHaveBeenCalled();
});

// T17
it('T17: ENRICHING session triggers the completion check exactly once', async () => {
  await taskRunner.finish('t1', { status: 'FOUND', result: {} });
  expect(completionSpy).toHaveBeenCalledTimes(1);
  expect(completionSpy).toHaveBeenCalledWith(txMock, 's1');
});

// T18
it('T18: a locked session makes finish a full no-op', async () => {
  txMock.sessionTask.findUniqueOrThrow.mockImplementation(async () =>
    makeTask({ session: { id: 's1', agentId: 7, lockedAt: new Date(), status: 'ENRICHING' } })
  );
  await taskRunner.finish('t1', { status: 'FOUND', result: {} });
  expect(txMock.socialProfileResult.upsert).not.toHaveBeenCalled();
  expect(txMock.sessionTask.updateMany).not.toHaveBeenCalled();
  expect(txMock.osintSession.update).not.toHaveBeenCalled();
});

// T19
it('T19: WEB_SEARCH result maps to webSearchResult, not socialProfileResult', async () => {
  txMock.sessionTask.findUniqueOrThrow.mockImplementation(async () =>
    makeTask({ platform: 'WEB_SEARCH' })
  );
  await taskRunner.finish('t1', { status: 'FOUND', result: { query: 'jane doe', results: [] } });
  expect(txMock.webSearchResult.upsert).toHaveBeenCalledTimes(1);
  expect(txMock.socialProfileResult.upsert).not.toHaveBeenCalled();
});

// T20
it('T20: INSTAGRAM result maps to instagramResult with exact field names', async () => {
  txMock.sessionTask.findUniqueOrThrow.mockImplementation(async () =>
    makeTask({ platform: 'INSTAGRAM' })
  );
  await taskRunner.finish('t1', {
    status: 'FOUND',
    result: { username: 'jane', extractedEmails: ['a@b.com'] },
  });
  const call = txMock.instagramResult.upsert.mock.calls[0][0];
  expect(call.create.username).toBe('jane');
  expect(call.create.extractedEmails).toEqual(['a@b.com']);
});

// --- fail() / release() / skip() / notFound() -------------------------------

// T21
it('T21: fail() on final attempt refunds the platform cost', async () => {
  txMock.sessionTask.findUniqueOrThrow.mockImplementation(async () =>
    makeTask({ chargedAt: new Date() })
  );
  await taskRunner.fail('t1', 'NETWORK', 'boom');
  expect(refundSpy).toHaveBeenCalledTimes(1);
  expect(refundSpy).toHaveBeenCalledWith(
    txMock,
    7,
    10,
    expect.objectContaining({ sessionId: 's1', taskId: 't1', platform: 'GITHUB' })
  );
  const updateCall = txMock.sessionTask.updateMany.mock.calls[0][0];
  expect(updateCall.data.status).toBe('FAILED');
  expect(txMock.osintSession.update).toHaveBeenCalledWith({
    where: { id: 's1' },
    data: { failedTasks: { increment: 1 } },
  });
});

// T22
it('T22: release() does not refund', async () => {
  await taskRunner.release('t1', 'NETWORK', 'transient failure');
  expect(refundSpy).not.toHaveBeenCalled();
  const updateCall = txMock.sessionTask.updateMany.mock.calls[0][0];
  expect(updateCall.data.status).toBe('PENDING');
});

// T23
it('T23: notFound() refunds 0 times', async () => {
  await taskRunner.notFound('t1', 'no such user');
  expect(refundSpy).not.toHaveBeenCalled();
});

// T24
it('T24: skip() refunds exactly once', async () => {
  txMock.sessionTask.findUniqueOrThrow.mockImplementation(async () =>
    makeTask({ chargedAt: new Date() })
  );
  await taskRunner.skip('t1', 'auth expired', 'AUTH_EXPIRED');
  expect(refundSpy).toHaveBeenCalledTimes(1);
  const updateCall = txMock.sessionTask.updateMany.mock.calls[0][0];
  expect(updateCall.data.status).toBe('SKIPPED');
});

// T25
it('T25: fail()/skip()/notFound() never double-refund an already-terminal task', async () => {
  txMock.sessionTask.updateMany.mockImplementation(async () => ({ count: 0 }));
  await taskRunner.fail('t1', 'NETWORK', 'boom');
  await taskRunner.skip('t1', 'x', 'AUTH_EXPIRED');
  await taskRunner.notFound('t1', 'x');
  expect(refundSpy).not.toHaveBeenCalled();
});
