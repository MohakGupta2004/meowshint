import { beforeAll, describe, expect, it } from 'bun:test';

import { PrismaClient } from '../../generated/prisma/client';
import { prisma as appPrisma } from '../../src/lib/prisma';
import { creditsService } from '../../src/modules/credits/service';

// Real Postgres ledger tests. Gated on TEST_DATABASE_URL; skips cleanly when unset
// so plain `bun test` runs without Docker.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const db = TEST_DATABASE_URL ? new PrismaClient({ datasourceUrl: TEST_DATABASE_URL }) : null;

describe.skipIf(!db)('integration ledger', () => {
  let agentId: number;
  let sessionId: string;

  beforeAll(async () => {
    if (!db) return;
    // Clean slate for this agent
    const user = await db.user.create({
      data: { email: `ledger-${Date.now()}@test.com`, passwordHash: 'x', creditBalance: 0 },
    });
    agentId = user.id;
  });

  it('I1: concurrent spend does not oversell', async () => {
    await db.user.update({ where: { id: agentId }, data: { creditBalance: 10 } });
    const session = await db.osintSession.create({
      data: { agentId, query: 'q', platforms: ['WEB_SEARCH'], status: 'ENRICHING' },
    });
    sessionId = session.id;
    const task = await db.sessionTask.create({ data: { sessionId, platform: 'WEB_SEARCH' } });

    const results = await Promise.allSettled([
      creditsService.spend(db as any, agentId, 10, {
        sessionId,
        taskId: task.id,
        platform: 'WEB_SEARCH',
        kind: 'WEB_SEARCH',
      }),
      creditsService.spend(db as any, agentId, 10, {
        sessionId,
        taskId: task.id,
        platform: 'WEB_SEARCH',
        kind: 'WEB_SEARCH',
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;
    expect(fulfilled).toBe(1);
    expect(rejected).toBe(1);
    const user = await db.user.findUnique({ where: { id: agentId } });
    expect(user!.creditBalance).toBe(0);
    const rows = await db.creditTransaction.count({ where: { agentId } });
    expect(rows).toBe(1);
  });

  it('I2: ledger invariant holds', async () => {
    await db.user.update({ where: { id: agentId }, data: { creditBalance: 0 } });
    const session = await db.osintSession.create({
      data: { agentId, query: 'q2', platforms: ['WEB_SEARCH'], status: 'ENRICHING' },
    });
    sessionId = session.id;
    const ops = [
      () => creditsService.grant(agentId, 100, 'g'),
      () =>
        creditsService.spend(db as any, agentId, 10, {
          sessionId,
          platform: 'WEB_SEARCH',
          kind: 'WEB_SEARCH',
        }),
      () =>
        creditsService.spend(db as any, agentId, 5, {
          sessionId,
          platform: 'WEB_SEARCH',
          kind: 'WEB_SEARCH',
        }),
      () => creditsService.refund(db as any, agentId, 10, { sessionId }),
      () => creditsService.grant(agentId, 20, 'g'),
    ];
    for (const op of ops) await op();

    const user = await db.user.findUnique({ where: { id: agentId } });
    const sum = await db.creditTransaction.aggregate({
      where: { agentId },
      _sum: { amount: true },
    });
    expect(sum._sum.amount).toBe(user!.creditBalance);
  });

  it('I3: balanceAfter tracks the running sum', async () => {
    await db.user.update({ where: { id: agentId }, data: { creditBalance: 0 } });
    const session = await db.osintSession.create({
      data: { agentId, query: 'q3', platforms: ['WEB_SEARCH'], status: 'ENRICHING' },
    });
    sessionId = session.id;
    await creditsService.grant(agentId, 50, 'g');
    await creditsService.spend(db as any, agentId, 10, {
      sessionId,
      platform: 'WEB_SEARCH',
      kind: 'WEB_SEARCH',
    });

    const rows = await db.creditTransaction.findMany({
      where: { agentId },
      orderBy: { createdAt: 'asc' },
    });
    let running = 0;
    for (const r of rows) {
      running += r.amount;
      expect(r.balanceAfter).toBe(running);
    }
  });

  it('I4: failed transaction rolls back both writes', async () => {
    await db.user.update({ where: { id: agentId }, data: { creditBalance: 100 } });
    const before = await db.user.findUnique({ where: { id: agentId } });

    await expect(
      db.$transaction(async (tx: any) => {
        await creditsService.spend(tx, agentId, 10, {
          sessionId,
          platform: 'WEB_SEARCH',
          kind: 'WEB_SEARCH',
        });
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    const after = await db.user.findUnique({ where: { id: agentId } });
    expect(after!.creditBalance).toBe(before!.creditBalance);
    const rows = await db.creditTransaction.count({ where: { agentId } });
    expect(rows).toBe(0);
  });
});
