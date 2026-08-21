import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import { InsufficientCreditsError } from '../../src/errors';
import { prisma } from '../../src/lib/prisma';
import { creditsService } from '../../src/modules/credits/service';
import { makePrismaMock } from '../helpers/prisma-mock';

// Shared transaction-client mock used by spend()/refund() (they REQUIRE a tx arg)
function makeTx() {
  return {
    $queryRaw: mock(),
    user: { update: mock() },
    creditTransaction: { create: mock() },
    osintSession: { update: mock() },
    sessionTask: { update: mock() },
  };
}

// Transaction-client mock used by grant()'s own $transaction
const grantTx = {
  $queryRaw: mock(),
  user: { update: mock() },
  creditTransaction: { create: mock() },
};

mock.module('../../src/lib/prisma', () => {
  const prismaMock = makePrismaMock({
    $transaction: mock(async (cb: any) => cb(grantTx)),
  });
  return { prisma: prismaMock, connectDatabase: mock(), disconnectDatabase: mock() };
});

describe('creditsService', () => {
  beforeEach(() => {
    (prisma.user.findUnique as any).mockClear();
    (prisma.user.update as any).mockClear();
    (prisma.creditTransaction.create as any).mockClear();
    (prisma.creditTransaction.count as any).mockClear();
    (prisma.creditTransaction.findMany as any).mockClear();
    (prisma.osintSession.update as any).mockClear();
    (prisma.sessionTask.update as any).mockClear();
    (prisma.$transaction as any).mockClear();
    (prisma.$queryRaw as any).mockClear();
    (grantTx.$queryRaw as any).mockClear();
    (grantTx.user.update as any).mockClear();
    (grantTx.creditTransaction.create as any).mockClear();
    (grantTx.$queryRaw as any).mockResolvedValue([{ id: 1, creditBalance: 0 }]);
  });

  describe('spend()', () => {
    it('C1: debits, does not credit', async () => {
      // 🔴/✅ mutation: in credits/service.ts, amount: -amount
      const tx = makeTx();
      (tx.$queryRaw as any).mockResolvedValue([{ id: 1, creditBalance: 100 }]);

      await creditsService.spend(tx as any, 1, 10, {
        sessionId: 's1',
        taskId: 't1',
        platform: 'WEB_SEARCH' as any,
        kind: 'WEB_SEARCH' as any,
        reason: 'test',
      });

      const createArg = (tx.creditTransaction.create as any).mock.calls[0][0].data;
      expect(createArg.amount).toBe(-10);
      expect(createArg.balanceAfter).toBe(90);

      const updateArg = (tx.user.update as any).mock.calls[0][0].data;
      expect(updateArg.creditBalance).toBe(90);
    });

    it('C2: insufficient balance rejects with no partial write', async () => {
      // 🔴/✅ mutation: amount < balance check
      const tx = makeTx();
      (tx.$queryRaw as any).mockResolvedValue([{ id: 1, creditBalance: 5 }]);

      await expect(
        creditsService.spend(tx as any, 1, 10, {
          sessionId: 's1',
          taskId: 't1',
          platform: 'WEB_SEARCH' as any,
          kind: 'WEB_SEARCH' as any,
        })
      ).rejects.toThrow(InsufficientCreditsError);

      expect((tx.user.update as any).mock.calls.length).toBe(0);
      expect((tx.creditTransaction.create as any).mock.calls.length).toBe(0);
    });

    it('C3: exact-balance boundary succeeds', async () => {
      // pins < vs <=
      const tx = makeTx();
      (tx.$queryRaw as any).mockResolvedValue([{ id: 1, creditBalance: 10 }]);

      await creditsService.spend(tx as any, 1, 10, {
        sessionId: 's1',
        taskId: 't1',
        platform: 'WEB_SEARCH' as any,
        kind: 'WEB_SEARCH' as any,
      });

      const createArg = (tx.creditTransaction.create as any).mock.calls[0][0].data;
      expect(createArg.balanceAfter).toBe(0);
    });

    it('C4: honors caller-supplied kind', async () => {
      // regression guard on the old hardcoded ternary
      const tx = makeTx();
      (tx.$queryRaw as any).mockResolvedValue([{ id: 1, creditBalance: 100 }]);

      await creditsService.spend(tx as any, 1, 10, {
        sessionId: 's1',
        taskId: 't1',
        platform: 'WEB_SEARCH' as any,
        kind: 'PREMIUM_QUERY' as any,
      });

      const createArg = (tx.creditTransaction.create as any).mock.calls[0][0].data;
      expect(createArg.kind).toBe('PREMIUM_QUERY');
    });

    it('C5: increments session total', async () => {
      const tx = makeTx();
      (tx.$queryRaw as any).mockResolvedValue([{ id: 1, creditBalance: 100 }]);

      await creditsService.spend(tx as any, 1, 10, {
        sessionId: 's1',
        taskId: 't1',
        platform: 'WEB_SEARCH' as any,
        kind: 'WEB_SEARCH' as any,
      });

      const updateArg = (tx.osintSession.update as any).mock.calls[0][0].data;
      expect(updateArg.creditsSpent).toEqual({ increment: 10 });
    });

    it('C6: increments task cost only when taskId given', async () => {
      const tx = makeTx();
      (tx.$queryRaw as any).mockResolvedValue([{ id: 1, creditBalance: 100 }]);

      await creditsService.spend(tx as any, 1, 10, {
        sessionId: 's1',
        taskId: 't1',
        platform: 'WEB_SEARCH' as any,
        kind: 'WEB_SEARCH' as any,
      });
      expect((tx.sessionTask.update as any).mock.calls.length).toBe(1);
      expect((tx.sessionTask.update as any).mock.calls[0][0].data.creditCost).toEqual({
        increment: 10,
      });

      (tx.sessionTask.update as any).mockClear();
      await creditsService.spend(tx as any, 1, 10, {
        sessionId: 's1',
        platform: 'WEB_SEARCH' as any,
        kind: 'WEB_SEARCH' as any,
      });
      expect((tx.sessionTask.update as any).mock.calls.length).toBe(0);
    });

    it('C7: takes a row lock before reading', async () => {
      const tx = makeTx();
      (tx.$queryRaw as any).mockResolvedValue([{ id: 1, creditBalance: 100 }]);

      await creditsService.spend(tx as any, 1, 10, {
        sessionId: 's1',
        taskId: 't1',
        platform: 'WEB_SEARCH' as any,
        kind: 'WEB_SEARCH' as any,
      });

      expect((tx.$queryRaw as any).mock.calls.length).toBe(1);
      const sql = (tx.$queryRaw as any).mock.calls[0][0].raw.join('');
      expect(sql).toContain('FOR UPDATE');
    });

    it('C8: never touches the module singleton', async () => {
      const tx = makeTx();
      (tx.$queryRaw as any).mockResolvedValue([{ id: 1, creditBalance: 100 }]);

      await creditsService.spend(tx as any, 1, 10, {
        sessionId: 's1',
        taskId: 't1',
        platform: 'WEB_SEARCH' as any,
        kind: 'WEB_SEARCH' as any,
      });

      expect((prisma.user.update as any).mock.calls.length).toBe(0);
      expect((prisma.creditTransaction.create as any).mock.calls.length).toBe(0);
    });
  });

  describe('refund()', () => {
    it('C9: credits positively', async () => {
      const tx = makeTx();
      (tx.$queryRaw as any).mockResolvedValue([{ id: 1, creditBalance: 90 }]);

      await creditsService.refund(tx as any, 1, 10, {
        sessionId: 's1',
        taskId: 't1',
        platform: 'WEB_SEARCH' as any,
        reason: 'refund',
      });

      const createArg = (tx.creditTransaction.create as any).mock.calls[0][0].data;
      expect(createArg.amount).toBe(10);
      expect(createArg.kind).toBe('REFUND');
      expect(createArg.balanceAfter).toBe(100);
    });

    it('C10: no balance check', async () => {
      const tx = makeTx();
      (tx.$queryRaw as any).mockResolvedValue([{ id: 1, creditBalance: 0 }]);

      await expect(
        creditsService.refund(tx as any, 1, 10, { sessionId: 's1' })
      ).resolves.toBeUndefined();
    });

    it('C11: 🔴 decrements session total', async () => {
      // FAILS now: refund() never touches creditsSpent
      // mutation: add osintSession.update decrement in refund
      const tx = makeTx();
      (tx.$queryRaw as any).mockResolvedValue([{ id: 1, creditBalance: 90 }]);

      await creditsService.refund(tx as any, 1, 10, {
        sessionId: 's1',
        taskId: 't1',
        platform: 'WEB_SEARCH' as any,
        reason: 'refund',
      });

      expect((tx.osintSession.update as any).mock.calls.length).toBe(1);
      const updateArg = (tx.osintSession.update as any).mock.calls[0][0].data;
      expect(updateArg.creditsSpent).toEqual({ decrement: 10 });
    });
  });

  describe('grant()', () => {
    it('C12: positive, kind GRANT, no session', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 1, creditBalance: 0 });

      await creditsService.grant(1, 10, 'topup');

      const createArg = (grantTx.creditTransaction.create as any).mock.calls[0][0].data;
      expect(createArg.amount).toBe(10);
      expect(createArg.kind).toBe('GRANT');
      expect(createArg.sessionId).toBeNull();
    });

    it('C13: opens its own transaction', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 1, creditBalance: 0 });

      await creditsService.grant(1, 10, 'topup');

      expect((prisma.$transaction as any).mock.calls.length).toBe(1);
    });
  });
});
