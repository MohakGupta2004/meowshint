import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { ConflictError, NotFoundError, SessionLockedError } from '../../src/errors';
import { prisma } from '../../src/lib/prisma';
import { creditsService } from '../../src/modules/credits/service';
import { sessionsService } from '../../src/modules/sessions/service';
import { makePrismaMock } from '../helpers/prisma-mock';

const txMock: any = {
  $queryRaw: mock(),
  candidate: { update: mock(), findUnique: mock(), findMany: mock() },
  sessionTask: {
    createMany: mock(),
    update: mock(),
    updateMany: mock(async () => ({ count: 1 })),
    findUnique: mock(),
    findUniqueOrThrow: mock(),
    findMany: mock(),
    create: mock(),
  },
  osintSession: { update: mock(), create: mock() },
  webSearchResult: { create: mock() },
  instagramResult: { create: mock() },
  linkedInResult: { create: mock() },
  socialProfileResult: { create: mock() },
  creditTransaction: { create: mock() },
};

mock.module('../../src/lib/prisma', () => {
  const prismaMock: any = makePrismaMock({
    $transaction: mock(async (cb: any) => cb(txMock)),
  });
  return { prisma: prismaMock, connectDatabase: mock(), disconnectDatabase: mock() };
});

const dispatchTasksMock = mock(async () => {});
mock.module('../../src/modules/sessions/dispatch', () => ({
  dispatchTasks: dispatchTasksMock,
}));

// Spy on the real creditsService rather than mock.module()'ing it — a module
// mock here is process-global and would clobber credits/service.test.ts's own
// import of the real module when the whole suite runs together (R9).
let spendSpy: ReturnType<typeof spyOn>;
let refundSpy: ReturnType<typeof spyOn>;

function makeSession(overrides: any = {}) {
  return {
    id: 'session-1',
    agentId: 1,
    query: 'John Doe',
    queryContext: 'works at Acme',
    status: 'ENRICHING',
    selectedCandidateId: null,
    platforms: ['WEB_SEARCH', 'INSTAGRAM'],
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    creditsSpent: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    closedAt: null,
    lockedAt: null,
    candidates: [],
    tasks: [],
    targetProfile: null,
    ...overrides,
  };
}

function makeTask(overrides: any = {}) {
  return {
    id: 'task-1',
    sessionId: 'session-1',
    platform: 'WEB_SEARCH',
    status: 'PENDING',
    creditCost: 0,
    attempts: 0,
    errorCode: null,
    errorMessage: null,
    queuedAt: new Date('2024-01-01'),
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

const PLATFORMS = [
  'WEB_SEARCH',
  'INSTAGRAM',
  'LINKEDIN',
  'GITHUB',
  'TWITCH',
  'YOUTUBE',
  'TIKTOK',
  'PINTEREST',
  'LINKTREE',
];

describe('sessionsService', () => {
  beforeEach(() => {
    for (const key of Object.keys(txMock)) {
      if (typeof txMock[key] === 'object' && txMock[key] !== null) {
        for (const m of Object.keys(txMock[key])) {
          if (typeof txMock[key][m] === 'function' && (txMock[key][m] as any).mockClear) {
            (txMock[key][m] as any).mockClear();
          }
        }
      }
    }
    (prisma.osintSession.findUnique as any).mockClear();
    (prisma.osintSession.findFirst as any).mockClear();
    (prisma.osintSession.update as any).mockClear();
    (prisma.sessionTask.findUnique as any).mockClear();
    (prisma.sessionTask.update as any).mockClear();
    (prisma.sessionTask.create as any).mockClear();
    (prisma.sessionTask.createMany as any).mockClear();
    (prisma.sessionTask.findMany as any).mockClear();
    (txMock.sessionTask.findMany as any).mockResolvedValue([]);
    (prisma.candidate.findUnique as any).mockClear();
    (prisma.candidate.update as any).mockClear();
    (prisma.$transaction as any).mockClear();
    spendSpy = spyOn(creditsService, 'spend').mockResolvedValue(undefined as any);
    refundSpy = spyOn(creditsService, 'refund').mockResolvedValue(undefined as any);
    dispatchTasksMock.mockClear();
  });

  afterEach(() => {
    spendSpy.mockRestore();
    refundSpy.mockRestore();
  });

  describe('selectCandidate()', () => {
    it('S1: wrong status rejects', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING', candidates: [{ id: 'c1', selected: false }] })
      );
      await expect(sessionsService.selectCandidate('session-1', 'c1', 1)).rejects.toThrow(
        ConflictError
      );
      expect((prisma.sessionTask.createMany as any).mock.calls.length).toBe(0);
    });

    it('S2: foreign candidate rejects', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(
        makeSession({ status: 'DISAMBIGUATION', candidates: [{ id: 'c1', selected: false }] })
      );
      await expect(sessionsService.selectCandidate('session-1', 'c-other', 1)).rejects.toThrow(
        NotFoundError
      );
    });

    it('S3: locked session rejects', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(
        makeSession({
          status: 'DISAMBIGUATION',
          lockedAt: new Date('2024-01-02'),
          candidates: [
            { id: 'c1', selected: false, handles: { INSTAGRAM: 'jdoe', GITHUB: 'jdoe' } },
          ],
        })
      );
      await expect(sessionsService.selectCandidate('session-1', 'c1', 1)).rejects.toThrow(
        SessionLockedError
      );
      expect((prisma.candidate.update as any).mock.calls.length).toBe(0);
    });

    it('S4: happy path transition', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(
        makeSession({
          status: 'DISAMBIGUATION',
          platforms: ['WEB_SEARCH', 'INSTAGRAM', 'GITHUB'],
          candidates: [
            { id: 'c1', selected: false, handles: { INSTAGRAM: 'jdoe', GITHUB: 'jdoe' } },
          ],
        })
      );
      await sessionsService.selectCandidate('session-1', 'c1', 1);

      const candArg = (txMock.candidate.update as any).mock.calls[0][0];
      expect(candArg.data.selected).toBe(true);

      const sessUpdate = (txMock.osintSession.update as any).mock.calls[0][0];
      expect(sessUpdate.data.status).toBe('ENRICHING');
      expect(sessUpdate.data.selectedCandidateId).toBe('c1');
      expect(sessUpdate.data.totalTasks).toBe(3);
    });

    it('S5: one task per requested platform, no more', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(
        makeSession({
          status: 'DISAMBIGUATION',
          platforms: ['WEB_SEARCH', 'INSTAGRAM', 'GITHUB'],
          candidates: [
            { id: 'c1', selected: false, handles: { INSTAGRAM: 'jdoe', GITHUB: 'jdoe' } },
          ],
        })
      );
      await sessionsService.selectCandidate('session-1', 'c1', 1);

      const createManyArg = (txMock.sessionTask.createMany as any).mock.calls[0][0].data;
      expect(createManyArg).toHaveLength(3);
      for (const row of createManyArg) {
        expect(row.status).toBe('PENDING');
      }
      const platformSet = createManyArg.map((r: any) => r.platform).sort();
      expect(platformSet).toEqual(['GITHUB', 'INSTAGRAM', 'WEB_SEARCH']);
    });
  });

  describe('startTask() — charge point', () => {
    it('S6: 🔴 charges credits here', async () => {
      // FAILS now if startTask does not call spend
      (prisma.sessionTask.findUnique as any).mockResolvedValue(makeTask({ status: 'PENDING' }));
      (prisma.osintSession.findUnique as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING' })
      );

      await sessionsService.startTask('task-1', 1);

      expect((spendSpy as any).mock.calls.length).toBe(1);
    });

    it('S7: 🔴 per-platform cost and kind', async () => {
      // FAILS now if startTask does not charge
      (prisma.osintSession.findUnique as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING' })
      );

      (prisma.sessionTask.findUnique as any).mockResolvedValue(
        makeTask({ status: 'PENDING', platform: 'WEB_SEARCH' })
      );
      await sessionsService.startTask('task-1', 1);
      const webCall = (spendSpy as any).mock.calls[0];
      expect(webCall[2]).toBe(5);
      expect(webCall[3].kind).toBe('WEB_SEARCH');

      (spendSpy as any).mockClear();
      (prisma.sessionTask.findUnique as any).mockResolvedValue(
        makeTask({ status: 'PENDING', platform: 'INSTAGRAM' })
      );
      await sessionsService.startTask('task-1', 1);
      const igCall = (spendSpy as any).mock.calls[0];
      expect(igCall[2]).toBe(10);
      expect(igCall[3].kind).toBe('SCRAPE');
    });

    it('S8: 🔴 locked session rejects', async () => {
      // FAILS now if startTask has no assertNotLocked
      (prisma.sessionTask.findUnique as any).mockResolvedValue(makeTask({ status: 'PENDING' }));
      (prisma.osintSession.findUnique as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING', lockedAt: new Date('2024-01-02') })
      );
      await expect(sessionsService.startTask('task-1', 1)).rejects.toThrow(SessionLockedError);
      expect((txMock.sessionTask.update as any).mock.calls.length).toBe(0);
    });

    it('S9: 🔴 double-start rejects, no double charge', async () => {
      // FAILS now: no status guard -> calling twice charges twice
      (prisma.sessionTask.findUnique as any).mockResolvedValue(makeTask({ status: 'RUNNING' }));
      (prisma.osintSession.findUnique as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING' })
      );

      await expect(sessionsService.startTask('task-1', 1)).rejects.toThrow(ConflictError);
      expect((spendSpy as any).mock.calls.length).toBe(0);
    });

    it('S10: sets RUNNING + startedAt', async () => {
      (prisma.sessionTask.findUnique as any).mockResolvedValue(makeTask({ status: 'PENDING' }));
      (prisma.osintSession.findUnique as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING' })
      );

      await sessionsService.startTask('task-1', 1);

      const arg = (txMock.sessionTask.update as any).mock.calls[0][0].data;
      expect(arg.status).toBe('RUNNING');
      expect(arg.startedAt).toBeInstanceOf(Date);
    });
  });

  describe('completeTask()', () => {
    it('S11: 🔴 does not move credits', async () => {
      // FAILS now only if completeTask calls refund/spend
      (prisma.sessionTask.findUnique as any).mockResolvedValue(
        makeTask({ status: 'RUNNING', platform: 'INSTAGRAM' })
      );
      (prisma.osintSession.findUnique as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING' })
      );

      await sessionsService.completeTask('task-1', 1, { summaryText: 'done' });

      expect((refundSpy as any).mock.calls.length).toBe(0);
      expect((spendSpy as any).mock.calls.length).toBe(0);
    });

    it('S12: routes result to the right table', async () => {
      for (const platform of PLATFORMS) {
        (prisma.sessionTask.findUnique as any).mockResolvedValue(
          makeTask({ status: 'RUNNING', platform })
        );
        (prisma.osintSession.findUnique as any).mockResolvedValue(
          makeSession({ status: 'ENRICHING' })
        );

        await sessionsService.completeTask('task-1', 1, { summaryText: 'done' });

        const ws = (txMock.webSearchResult.create as any).mock.calls.length;
        const ig = (txMock.instagramResult.create as any).mock.calls.length;
        const li = (txMock.linkedInResult.create as any).mock.calls.length;
        const sp = (txMock.socialProfileResult.create as any).mock.calls.length;

        const expected =
          platform === 'WEB_SEARCH'
            ? [ws, 0, 0, 0]
            : platform === 'INSTAGRAM'
              ? [0, ig, 0, 0]
              : platform === 'LINKEDIN'
                ? [0, 0, li, 0]
                : [0, 0, 0, sp];
        expect([ws, ig, li, sp]).toEqual(expected);

        for (const m of [
          txMock.webSearchResult.create,
          txMock.instagramResult.create,
          txMock.linkedInResult.create,
          txMock.socialProfileResult.create,
        ] as any[]) {
          (m as any).mockClear();
        }
      }
    });

    it('S13: marks FOUND and counts', async () => {
      (prisma.sessionTask.findUnique as any).mockResolvedValue(
        makeTask({ status: 'RUNNING', platform: 'WEB_SEARCH' })
      );
      (prisma.osintSession.findUnique as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING' })
      );

      await sessionsService.completeTask('task-1', 1, { summaryText: 'done' });

      const taskUpdate = (txMock.sessionTask.update as any).mock.calls[0][0].data;
      expect(taskUpdate.status).toBe('FOUND');
      expect(taskUpdate.finishedAt).toBeInstanceOf(Date);

      const sessUpdate = (txMock.osintSession.update as any).mock.calls.find(
        (c: any) => c[0].data.completedTasks
      );
      expect(sessUpdate[0].data.completedTasks).toEqual({ increment: 1 });
    });

    it('S14: 🔴 locked session rejects', async () => {
      // FAILS now if completeTask has no assertNotLocked
      (prisma.sessionTask.findUnique as any).mockResolvedValue(
        makeTask({ status: 'RUNNING', platform: 'WEB_SEARCH' })
      );
      (prisma.osintSession.findUnique as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING', lockedAt: new Date('2024-01-02') })
      );
      await expect(
        sessionsService.completeTask('task-1', 1, { summaryText: 'done' })
      ).rejects.toThrow(SessionLockedError);
      expect((txMock.webSearchResult.create as any).mock.calls.length).toBe(0);
    });
  });

  describe('failTask()', () => {
    it('S15: refunds what was charged', async () => {
      (prisma.sessionTask.findUnique as any).mockResolvedValue(
        makeTask({ status: 'RUNNING', platform: 'INSTAGRAM' })
      );
      (prisma.osintSession.findUnique as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING' })
      );
      await sessionsService.failTask('task-1', 1, 'E1', 'boom');
      const igCall = (refundSpy as any).mock.calls[0];
      expect(igCall[2]).toBe(10);

      (refundSpy as any).mockClear();
      (prisma.sessionTask.findUnique as any).mockResolvedValue(
        makeTask({ status: 'RUNNING', platform: 'WEB_SEARCH' })
      );
      await sessionsService.failTask('task-1', 1, 'E1', 'boom');
      const webCall = (refundSpy as any).mock.calls[0];
      expect(webCall[2]).toBe(5);
    });

    it('S16: 🔴 never-charged task is not refunded', async () => {
      // FAILS now: failTask refunds unconditionally
      (prisma.sessionTask.findUnique as any).mockResolvedValue(
        makeTask({ status: 'PENDING', platform: 'INSTAGRAM' })
      );
      (prisma.osintSession.findUnique as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING' })
      );

      await sessionsService.failTask('task-1', 1, 'E1', 'boom');

      expect((refundSpy as any).mock.calls.length).toBe(0);
    });

    it('S17: records the error', async () => {
      (prisma.sessionTask.findUnique as any).mockResolvedValue(
        makeTask({ status: 'RUNNING', platform: 'INSTAGRAM' })
      );
      (prisma.osintSession.findUnique as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING' })
      );
      await sessionsService.failTask('task-1', 1, 'E1', 'boom');

      const taskUpdate = (txMock.sessionTask.update as any).mock.calls[0][0].data;
      expect(taskUpdate.status).toBe('FAILED');
      expect(taskUpdate.errorCode).toBe('E1');
      expect(taskUpdate.errorMessage).toBe('boom');

      const sessUpdate = (txMock.osintSession.update as any).mock.calls.find(
        (c: any) => c[0].data.failedTasks
      );
      expect(sessUpdate[0].data.failedTasks).toEqual({ increment: 1 });
    });
  });

  describe('checkSessionCompletion()', () => {
    function setStatuses(statuses: string[]) {
      (prisma.osintSession.findUnique as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING' })
      );
      (txMock.sessionTask.findMany as any).mockResolvedValue(
        statuses.map((s, i) => makeTask({ id: `t${i}`, status: s }))
      );
    }

    it('S18: all FOUND → COMPLETED', async () => {
      setStatuses(['FOUND', 'FOUND']);
      await (sessionsService as any).checkSessionCompletion(txMock, 'session-1');
      const arg = (txMock.osintSession.update as any).mock.calls[0][0].data;
      expect(arg.status).toBe('COMPLETED');
    });

    it('S19: 🔴 all NOT_FOUND → COMPLETED', async () => {
      // FAILS now if NOT_FOUND counted as failure
      setStatuses(['NOT_FOUND', 'NOT_FOUND']);
      await (sessionsService as any).checkSessionCompletion(txMock, 'session-1');
      const arg = (txMock.osintSession.update as any).mock.calls[0][0].data;
      expect(arg.status).toBe('COMPLETED');
    });

    it('S20: 🔴 FOUND + NOT_FOUND → COMPLETED', async () => {
      setStatuses(['FOUND', 'NOT_FOUND']);
      await (sessionsService as any).checkSessionCompletion(txMock, 'session-1');
      const arg = (txMock.osintSession.update as any).mock.calls[0][0].data;
      expect(arg.status).toBe('COMPLETED');
    });

    it('S21: FOUND + FAILED → PARTIAL', async () => {
      setStatuses(['FOUND', 'FAILED']);
      await (sessionsService as any).checkSessionCompletion(txMock, 'session-1');
      const arg = (txMock.osintSession.update as any).mock.calls[0][0].data;
      expect(arg.status).toBe('PARTIAL');
    });

    it('S22: all FAILED → FAILED', async () => {
      setStatuses(['FAILED', 'FAILED']);
      await (sessionsService as any).checkSessionCompletion(txMock, 'session-1');
      const arg = (txMock.osintSession.update as any).mock.calls[0][0].data;
      expect(arg.status).toBe('FAILED');
    });

    it('S23: 🔴 NOT_FOUND + FAILED, no FOUND → PARTIAL', async () => {
      setStatuses(['NOT_FOUND', 'FAILED']);
      await (sessionsService as any).checkSessionCompletion(txMock, 'session-1');
      const arg = (txMock.osintSession.update as any).mock.calls[0][0].data;
      expect(arg.status).toBe('PARTIAL');
    });

    it('S24: all SKIPPED → COMPLETED', async () => {
      setStatuses(['SKIPPED', 'SKIPPED']);
      await (sessionsService as any).checkSessionCompletion(txMock, 'session-1');
      const arg = (txMock.osintSession.update as any).mock.calls[0][0].data;
      expect(arg.status).toBe('COMPLETED');
    });

    it('S25: any PENDING or RUNNING → no premature completion', async () => {
      setStatuses(['FOUND', 'PENDING']);
      await (sessionsService as any).checkSessionCompletion(txMock, 'session-1');
      expect((txMock.osintSession.update as any).mock.calls.length).toBe(0);

      setStatuses(['FOUND', 'RUNNING']);
      await (sessionsService as any).checkSessionCompletion(txMock, 'session-1');
      expect((txMock.osintSession.update as any).mock.calls.length).toBe(0);
    });
  });

  describe('close() and ownership', () => {
    it('S26: close locks', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING' })
      );
      await sessionsService.close('session-1', 1);
      const arg = (prisma.osintSession.update as any).mock.calls[0][0].data;
      expect(arg.status).toBe('CLOSED');
      expect(arg.closedAt).toBeInstanceOf(Date);
      expect(arg.lockedAt).toBeInstanceOf(Date);
    });

    it('S27: double-close rejects', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(
        makeSession({ status: 'CLOSED', lockedAt: new Date('2024-01-02') })
      );
      await expect(sessionsService.close('session-1', 1)).rejects.toThrow(SessionLockedError);
    });

    it('S28: reads are agent-scoped', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(null);
      await expect(sessionsService.get('session-1', 2)).rejects.toThrow(NotFoundError);
      const where = (prisma.osintSession.findFirst as any).mock.calls[0][0].where;
      expect(where).toEqual({ id: 'session-1', agentId: 2 });
    });

    it('S29: 🔴 task mutations are agent-scoped', async () => {
      // FAILS now: these methods take no agentId
      (prisma.sessionTask.findUnique as any).mockResolvedValue(makeTask({ status: 'PENDING' }));
      (prisma.osintSession.findUnique as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING', agentId: 1 })
      );

      await expect((sessionsService as any).startTask('task-1', 2)).rejects.toThrow(NotFoundError);
      await expect(
        (sessionsService as any).completeTask('task-1', 2, { summaryText: 'x' })
      ).rejects.toThrow(NotFoundError);
      await expect((sessionsService as any).failTask('task-1', 2, 'E1', 'b')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('create() — WEB_SEARCH injection (S30–S32)', () => {
    it('S30: forces WEB_SEARCH into platforms if caller omitted it', async () => {
      (txMock.osintSession.create as any).mockResolvedValue(
        makeSession({ platforms: ['WEB_SEARCH', 'GITHUB'], totalTasks: 1 })
      );
      (txMock.sessionTask.create as any).mockResolvedValue({});
      (prisma.sessionTask.findMany as any).mockResolvedValue([]);

      await sessionsService.create(7, { query: 'x', platforms: ['GITHUB'] });

      const createArg = (txMock.osintSession.create as any).mock.calls[0][0];
      expect(createArg.data.platforms).toEqual(['WEB_SEARCH', 'GITHUB']);
      expect(createArg.data.totalTasks).toBe(1);
      expect((txMock.sessionTask.create as any).mock.calls.length).toBe(1);
      expect((txMock.sessionTask.create as any).mock.calls[0][0].data.platform).toBe('WEB_SEARCH');
    });

    it('S31: does not duplicate WEB_SEARCH if caller already included it', async () => {
      (txMock.osintSession.create as any).mockResolvedValue(
        makeSession({ platforms: ['WEB_SEARCH', 'GITHUB'], totalTasks: 1 })
      );
      (txMock.sessionTask.create as any).mockResolvedValue({});
      (prisma.sessionTask.findMany as any).mockResolvedValue([]);

      await sessionsService.create(7, { query: 'x', platforms: ['WEB_SEARCH', 'GITHUB'] });

      const createArg = (txMock.osintSession.create as any).mock.calls[0][0];
      expect(createArg.data.platforms).toEqual(['WEB_SEARCH', 'GITHUB']);
    });

    it('S32: dispatches after the transaction commits', async () => {
      (txMock.osintSession.create as any).mockResolvedValue(
        makeSession({ platforms: ['WEB_SEARCH', 'GITHUB'], totalTasks: 1 })
      );
      (txMock.sessionTask.create as any).mockResolvedValue({});
      (prisma.sessionTask.findMany as any).mockResolvedValue([]);

      await sessionsService.create(7, { query: 'x', platforms: ['GITHUB'] });

      expect((prisma.$transaction as any).mock.calls.length).toBe(1);
      expect(dispatchTasksMock.mock.calls.length).toBe(1);
      expect(dispatchTasksMock.mock.calls[0][0][0].kind).toBe('WEB_SEARCH');
      expect(dispatchTasksMock.mock.calls[0][0][0].query).toBe('x');
    });
  });

  describe('selectCandidate() — dispatch wiring (S33–S34)', () => {
    it('S33: createMany uses skipDuplicates:true', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(
        makeSession({
          status: 'DISAMBIGUATION',
          platforms: ['WEB_SEARCH', 'INSTAGRAM', 'GITHUB'],
          candidates: [
            { id: 'c1', selected: false, handles: { INSTAGRAM: 'jdoe', GITHUB: 'jdoe' } },
          ],
        })
      );
      (txMock.sessionTask.findMany as any).mockResolvedValue([
        makeTask({ id: 't1', platform: 'INSTAGRAM', status: 'PENDING' }),
        makeTask({ id: 't2', platform: 'GITHUB', status: 'PENDING' }),
      ]);
      (prisma.sessionTask.findMany as any).mockResolvedValue([
        makeTask({ id: 't1', platform: 'INSTAGRAM', status: 'PENDING' }),
        makeTask({ id: 't2', platform: 'GITHUB', status: 'PENDING' }),
      ]);

      await sessionsService.selectCandidate('session-1', 'c1', 1);

      const createManyArg = (txMock.sessionTask.createMany as any).mock.calls[0][0];
      expect(createManyArg.skipDuplicates).toBe(true);
    });

    it('S34: dispatches only PENDING rows, never re-dispatches WEB_SEARCH', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(
        makeSession({
          status: 'DISAMBIGUATION',
          platforms: ['WEB_SEARCH', 'INSTAGRAM', 'GITHUB'],
          candidates: [
            { id: 'c1', selected: false, handles: { INSTAGRAM: 'jdoe', GITHUB: 'jdoe' } },
          ],
        })
      );
      (txMock.sessionTask.findMany as any).mockResolvedValue([
        makeTask({ id: 't1', platform: 'INSTAGRAM', status: 'PENDING' }),
        makeTask({ id: 't2', platform: 'GITHUB', status: 'PENDING' }),
      ]);
      (prisma.sessionTask.findMany as any).mockResolvedValue([
        makeTask({ id: 't1', platform: 'INSTAGRAM', status: 'PENDING' }),
        makeTask({ id: 't2', platform: 'GITHUB', status: 'PENDING' }),
      ]);

      await sessionsService.selectCandidate('session-1', 'c1', 1);

      expect(dispatchTasksMock.mock.calls.length).toBe(1);
      const dispatched = dispatchTasksMock.mock.calls[0][0];
      expect(dispatched).toHaveLength(2);
      const platforms = dispatched.map((d: any) => d.platform ?? d.kind);
      expect(platforms).not.toContain('WEB_SEARCH');
      expect(platforms).toContain('INSTAGRAM');
      expect(platforms).toContain('GITHUB');
    });
  });

  describe('selectCandidate() — NO_HANDLE skip (S37–S39)', () => {
    it('S37: a platform with no discovered handle is skipped, not dispatched', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(
        makeSession({
          status: 'DISAMBIGUATION',
          platforms: ['WEB_SEARCH', 'INSTAGRAM', 'GITHUB'],
          candidates: [{ id: 'c1', selected: false, handles: { INSTAGRAM: 'jdoe' } }],
        })
      );
      const githubTask = makeTask({ id: 't2', platform: 'GITHUB', status: 'PENDING' });
      (txMock.sessionTask.findMany as any).mockResolvedValue([
        makeTask({ id: 't1', platform: 'INSTAGRAM', status: 'PENDING' }),
        githubTask,
      ]);
      (prisma.sessionTask.findMany as any).mockResolvedValue([
        makeTask({ id: 't1', platform: 'INSTAGRAM', status: 'PENDING' }),
        githubTask,
      ]);
      (txMock.sessionTask.findUniqueOrThrow as any).mockResolvedValue({
        ...githubTask,
        session: { id: 'session-1', status: 'ENRICHING', lockedAt: null },
      });

      await sessionsService.selectCandidate('session-1', 'c1', 1);

      const dispatched = dispatchTasksMock.mock.calls[0][0];
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0].platform).toBe('INSTAGRAM');
    });

    it('S38: the skipped task is written with status SKIPPED and errorCode NO_HANDLE, never claimed/charged', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(
        makeSession({
          status: 'DISAMBIGUATION',
          platforms: ['WEB_SEARCH', 'GITHUB'],
          candidates: [{ id: 'c1', selected: false, handles: {} }],
        })
      );
      const githubTask = makeTask({ id: 't2', platform: 'GITHUB', status: 'PENDING' });
      (txMock.sessionTask.findMany as any).mockResolvedValue([githubTask]);
      (prisma.sessionTask.findMany as any).mockResolvedValue([githubTask]);
      (txMock.sessionTask.findUniqueOrThrow as any).mockResolvedValue({
        ...githubTask,
        session: { id: 'session-1', status: 'ENRICHING', lockedAt: null },
      });

      await sessionsService.selectCandidate('session-1', 'c1', 1);

      expect(dispatchTasksMock.mock.calls.length).toBe(0);
      const updateManyArgs = (txMock.sessionTask.updateMany as any).mock.calls.find(
        (c: any) => c[0].where.id === 't2'
      );
      expect(updateManyArgs[0].where.status).toBe('PENDING');
      expect(updateManyArgs[0].data.status).toBe('SKIPPED');
      expect(updateManyArgs[0].data.errorCode).toBe('NO_HANDLE');
      expect(spendSpy).not.toHaveBeenCalled();
    });

    it('S39: a candidate with no handles at all skips every scrape platform', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(
        makeSession({
          status: 'DISAMBIGUATION',
          platforms: ['WEB_SEARCH', 'INSTAGRAM', 'GITHUB'],
          candidates: [{ id: 'c1', selected: false, handles: null }],
        })
      );
      const tasks = [
        makeTask({ id: 't1', platform: 'INSTAGRAM', status: 'PENDING' }),
        makeTask({ id: 't2', platform: 'GITHUB', status: 'PENDING' }),
      ];
      (txMock.sessionTask.findMany as any).mockResolvedValue(tasks);
      (prisma.sessionTask.findMany as any).mockResolvedValue(tasks);
      (txMock.sessionTask.findUniqueOrThrow as any).mockImplementation(async (args: any) => ({
        ...tasks.find((t) => t.id === args.where.id),
        session: { id: 'session-1', status: 'ENRICHING', lockedAt: null },
      }));

      await sessionsService.selectCandidate('session-1', 'c1', 1);

      expect(dispatchTasksMock.mock.calls.length).toBe(0);
      const skipCalls = (txMock.sessionTask.updateMany as any).mock.calls.filter(
        (c: any) => c[0].data.status === 'SKIPPED'
      );
      expect(skipCalls).toHaveLength(2);
    });
  });

  describe('createTask() — dispatch wiring (S35–S36)', () => {
    it('S35: increments totalTasks', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING', totalTasks: 3 })
      );
      (prisma.sessionTask.findUnique as any).mockResolvedValue(null);
      (txMock.sessionTask.create as any).mockResolvedValue(makeTask({ platform: 'TIKTOK' }));

      await sessionsService.createTask('session-1', 'TIKTOK', 1);

      const sessUpdate = (txMock.osintSession.update as any).mock.calls.find(
        (c: any) => c[0].data.totalTasks
      );
      expect(sessUpdate[0].data.totalTasks).toEqual({ increment: 1 });
    });

    it('S36: dispatches the new task after commit', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(
        makeSession({ status: 'ENRICHING', totalTasks: 3 })
      );
      (prisma.sessionTask.findUnique as any).mockResolvedValue(null);
      (txMock.sessionTask.create as any).mockResolvedValue(
        makeTask({ id: 'new-task', platform: 'TIKTOK' })
      );

      await sessionsService.createTask('session-1', 'TIKTOK', 1);

      expect((prisma.$transaction as any).mock.calls.length).toBe(1);
      expect(dispatchTasksMock.mock.calls.length).toBe(1);
      expect(dispatchTasksMock.mock.calls[0][0][0].kind).toBe('SCRAPE');
      expect(dispatchTasksMock.mock.calls[0][0][0].platform).toBe('TIKTOK');
    });
  });
});
