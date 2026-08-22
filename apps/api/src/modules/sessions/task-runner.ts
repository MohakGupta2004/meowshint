import { CreditKind, Platform, TaskStatus } from '../../../generated/prisma/client';
import { InsufficientCreditsError } from '../../errors';
import { prisma } from '../../lib/prisma';
import { creditsService } from '../credits/service';
import { mapResult } from './result-mapping';
import { sessionsService } from './service';

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const CREDIT_COSTS: Record<Platform, number> = {
  WEB_SEARCH: 5,
  INSTAGRAM: 10,
  LINKEDIN: 10,
  GITHUB: 10,
  TWITCH: 10,
  YOUTUBE: 10,
  TIKTOK: 10,
  PINTEREST: 10,
  LINKTREE: 10,
};

export interface CandidateDraft {
  displayName: string;
  snippet?: string;
  sourceUrl?: string;
  location?: string;
  handles?: Record<string, string>;
  score?: number;
  rank: number;
}

export type JobOutcome =
  | { status: 'FOUND'; result: Record<string, unknown>; candidates?: CandidateDraft[] }
  | { status: 'NOT_FOUND'; reason: string }
  | { status: 'SKIPPED'; reason: string; errorCode: string };

export type ClaimResult =
  | { ok: true; ctx: { taskId: string; platform: Platform; sessionId: string; agentId: number } }
  | { ok: false; reason: 'NOT_CLAIMABLE' | 'SESSION_LOCKED' | 'INSUFFICIENT_CREDITS' };

export const taskRunner = {
  // Fixes defect B (claim race) and the charge-once invariant. A single
  // conditional updateMany is the atomic claim; only the worker that gets
  // count:1 proceeds to charge credits.
  async claim(
    taskId: string,
    opts: { expectAgentId: number; staleAfterMs: number }
  ): Promise<ClaimResult> {
    return prisma.$transaction(async (tx: TransactionClient) => {
      const staleBefore = new Date(Date.now() - opts.staleAfterMs);

      const claimed = await tx.sessionTask.updateMany({
        where: {
          id: taskId,
          OR: [{ status: 'PENDING' }, { status: 'RUNNING', startedAt: { lt: staleBefore } }],
        },
        data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
      });

      if (claimed.count === 0) {
        return { ok: false, reason: 'NOT_CLAIMABLE' } as const;
      }

      const task = await tx.sessionTask.findUniqueOrThrow({
        where: { id: taskId },
        include: { session: true },
      });

      if (task.session.agentId !== opts.expectAgentId) {
        // Stale/tampered job — the caller should treat this as unrecoverable.
        throw new Error(`Task ${taskId} agent mismatch: job says ${opts.expectAgentId}`);
      }

      if (task.session.lockedAt) {
        return { ok: false, reason: 'SESSION_LOCKED' } as const;
      }

      if (task.chargedAt === null) {
        try {
          await creditsService.spend(tx, task.session.agentId, CREDIT_COSTS[task.platform], {
            sessionId: task.sessionId,
            taskId,
            platform: task.platform,
            kind:
              task.platform === 'WEB_SEARCH'
                ? ('WEB_SEARCH' as CreditKind)
                : ('SCRAPE' as CreditKind),
            reason: `${task.platform} scrape`,
          });
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            // Roll back the whole claim transaction (task stays RUNNING here but the
            // caller sees ok:false and must not retry — the caller writes SKIPPED
            // with no refund in a fresh transaction).
            return { ok: false, reason: 'INSUFFICIENT_CREDITS' } as const;
          }
          throw err;
        }

        await tx.sessionTask.update({ where: { id: taskId }, data: { chargedAt: new Date() } });
      }

      return {
        ok: true,
        ctx: {
          taskId,
          platform: task.platform,
          sessionId: task.sessionId,
          agentId: task.session.agentId,
        },
      } as const;
    });
  },

  // Fixes defect C (idempotent finish) and J (phase guard on completion check).
  async finish(taskId: string, outcome: JobOutcome): Promise<void> {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const task = await tx.sessionTask.findUniqueOrThrow({
        where: { id: taskId },
        include: { session: true },
      });

      if (task.session.lockedAt) return;

      if (outcome.status === 'FOUND') {
        const { model, data } = mapResult(task.platform, outcome.result);
        await (tx as any)[model].upsert({
          where: { taskId },
          create: { taskId, ...data },
          update: data,
        });

        if (outcome.candidates?.length) {
          await tx.candidate.deleteMany({ where: { sessionId: task.sessionId, selected: false } });
          await tx.candidate.createMany({
            data: outcome.candidates.map((c, i) => ({
              sessionId: task.sessionId,
              displayName: c.displayName,
              snippet: c.snippet ?? null,
              sourceUrl: c.sourceUrl ?? null,
              location: c.location ?? null,
              handles: c.handles ?? undefined,
              score: c.score ?? null,
              rank: i,
            })),
          });
        }
      }

      const nextStatus: TaskStatus = outcome.status === 'FOUND' ? 'FOUND' : outcome.status;

      const moved = await tx.sessionTask.updateMany({
        where: { id: taskId, status: 'RUNNING' },
        data: {
          status: nextStatus,
          finishedAt: new Date(),
          errorMessage: outcome.status === 'FOUND' ? null : outcome.reason,
          errorCode: outcome.status === 'SKIPPED' ? outcome.errorCode : null,
        },
      });

      if (moved.count === 0) return; // already terminal — no double-count

      if (outcome.status === 'FOUND' || outcome.status === 'NOT_FOUND') {
        await tx.osintSession.update({
          where: { id: task.sessionId },
          data: { completedTasks: { increment: 1 } },
        });
      }

      if (task.session.status === 'ENRICHING') {
        await sessionsService.checkSessionCompletion(tx, task.sessionId);
      }
    });
  },

  async fail(taskId: string, errorCode: string, errorMessage: string): Promise<void> {
    await terminalWithRefund(taskId, 'FAILED', errorCode, errorMessage, { incrementFailed: true });
  },

  async skip(taskId: string, reason: string, errorCode: string): Promise<void> {
    await terminalWithRefund(taskId, 'SKIPPED', errorCode, reason, { incrementFailed: false });
  },

  async notFound(taskId: string, reason: string): Promise<void> {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const task = await tx.sessionTask.findUniqueOrThrow({
        where: { id: taskId },
        include: { session: true },
      });
      if (task.session.lockedAt) return;

      const moved = await tx.sessionTask.updateMany({
        where: { id: taskId, status: 'RUNNING' },
        data: { status: 'NOT_FOUND', finishedAt: new Date(), errorMessage: reason },
      });
      if (moved.count === 0) return;

      await tx.osintSession.update({
        where: { id: task.sessionId },
        data: { completedTasks: { increment: 1 } },
      });

      if (task.session.status === 'ENRICHING') {
        await sessionsService.checkSessionCompletion(tx, task.sessionId);
      }
    });
  },

  // Skip a task that was never claimed/charged (e.g. no resolvable handle at
  // dispatch time) — never enqueued, so no refund is needed.
  async skipUnclaimed(taskId: string, errorCode: string, reason: string): Promise<void> {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const task = await tx.sessionTask.findUniqueOrThrow({
        where: { id: taskId },
        include: { session: true },
      });
      if (task.session.lockedAt) return;

      const moved = await tx.sessionTask.updateMany({
        where: { id: taskId, status: 'PENDING' },
        data: { status: 'SKIPPED', errorCode, errorMessage: reason, finishedAt: new Date() },
      });
      if (moved.count === 0) return;

      if (task.session.status === 'ENRICHING') {
        await sessionsService.checkSessionCompletion(tx, task.sessionId);
      }
    });
  },

  // Non-final-attempt retry: return the task to PENDING, no refund (it will be
  // re-claimed and re-run — the chargedAt guard prevents a double charge).
  async release(taskId: string, errorCode: string, errorMessage: string): Promise<void> {
    await prisma.$transaction(async (tx: TransactionClient) => {
      const moved = await tx.sessionTask.updateMany({
        where: { id: taskId, status: 'RUNNING' },
        data: { status: 'PENDING', errorCode, errorMessage },
      });
      void moved;
    });
  },
};

async function terminalWithRefund(
  taskId: string,
  status: 'FAILED' | 'SKIPPED',
  errorCode: string,
  errorMessage: string,
  opts: { incrementFailed: boolean }
): Promise<void> {
  await prisma.$transaction(async (tx: TransactionClient) => {
    const task = await tx.sessionTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { session: true },
    });
    if (task.session.lockedAt) return;

    const moved = await tx.sessionTask.updateMany({
      where: { id: taskId, status: 'RUNNING' },
      data: { status, errorCode, errorMessage, finishedAt: new Date() },
    });
    if (moved.count === 0) return; // already terminal — never double-refund

    if (task.chargedAt !== null) {
      await creditsService.refund(tx, task.session.agentId, CREDIT_COSTS[task.platform], {
        sessionId: task.sessionId,
        taskId,
        platform: task.platform,
        reason: `Refund for ${status.toLowerCase()} ${task.platform} task: ${errorMessage}`,
      });
    }

    if (opts.incrementFailed) {
      await tx.osintSession.update({
        where: { id: task.sessionId },
        data: { failedTasks: { increment: 1 } },
      });
    }

    if (task.session.status === 'ENRICHING') {
      await sessionsService.checkSessionCompletion(tx, task.sessionId);
    }
  });
}
