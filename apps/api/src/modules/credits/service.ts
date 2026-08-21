import { CreditKind, Platform } from '../../../generated/prisma/client';
import { InsufficientCreditsError, NotFoundError } from '../../errors';
import { prisma } from '../../lib/prisma';

// Type for Prisma transaction client (subset of PrismaClient)
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Credits service — ledger reads and spend/refund helpers
// All balance mutations go through $transaction to keep ledger and User.creditBalance in sync
export const creditsService = {
  // Get current balance for an agent
  async getBalance(agentId: number) {
    const user = await prisma.user.findUnique({
      where: { id: agentId },
      select: { creditBalance: true },
    });
    if (!user) throw new NotFoundError('User not found');
    return user.creditBalance;
  },

  // Get credit transaction history for an agent
  async getHistory(agentId: number, { page = 1, limit = 20 }: { page: number; limit: number }) {
    const [items, total] = await prisma.$transaction([
      prisma.creditTransaction.findMany({
        where: { agentId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.creditTransaction.count({ where: { agentId } }),
    ]);
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  },

  // Spend credits for a task — debits the agent and records a ledger row
  // tx is REQUIRED — caller must wrap in $transaction for atomicity
  async spend(
    tx: TransactionClient,
    agentId: number,
    amount: number,
    data: {
      sessionId: string;
      taskId?: string;
      platform: Platform;
      kind: CreditKind;
      reason?: string;
    }
  ) {
    // Atomic decrement with balance check — SELECT FOR UPDATE equivalent
    const [user] = await tx.$queryRaw<{ id: number; creditBalance: number }[]>`
      SELECT id, "creditBalance" FROM "User" WHERE id = ${agentId} FOR UPDATE
    `;
    if (!user) throw new NotFoundError('User not found');
    if (user.creditBalance < amount) throw new InsufficientCreditsError();

    const newBalance = user.creditBalance - amount;

    // Update denormalized balance and create ledger row atomically
    await tx.user.update({ where: { id: agentId }, data: { creditBalance: newBalance } });
    const txn = await tx.creditTransaction.create({
      data: {
        agentId,
        amount: -amount, // negative = debit
        kind: data.kind,
        sessionId: data.sessionId,
        taskId: data.taskId ?? null,
        platform: data.platform,
        reason: data.reason ?? null,
        balanceAfter: newBalance,
      },
    });

    // Update session's denormalized credit total
    await tx.osintSession.update({
      where: { id: data.sessionId },
      data: { creditsSpent: { increment: amount } },
    });

    // Update task's credit cost if taskId provided
    if (data.taskId) {
      await tx.sessionTask.update({
        where: { id: data.taskId },
        data: { creditCost: { increment: amount } },
      });
    }

    return txn;
  },

  // Refund credits for a failed task — reverses the original debit
  // tx is REQUIRED — caller must wrap in $transaction for atomicity
  async refund(
    tx: TransactionClient,
    agentId: number,
    amount: number,
    data: {
      sessionId: string;
      taskId?: string;
      platform?: Platform;
      reason?: string;
    }
  ) {
    const [user] = await tx.$queryRaw<{ id: number; creditBalance: number }[]>`
      SELECT id, "creditBalance" FROM "User" WHERE id = ${agentId} FOR UPDATE
    `;
    if (!user) throw new NotFoundError('User not found');

    const newBalance = user.creditBalance + amount;

    await tx.user.update({ where: { id: agentId }, data: { creditBalance: newBalance } });
    const txn = await tx.creditTransaction.create({
      data: {
        agentId,
        amount, // positive = refund
        kind: 'REFUND',
        sessionId: data.sessionId,
        taskId: data.taskId ?? null,
        platform: data.platform ?? null,
        reason: data.reason ?? null,
        balanceAfter: newBalance,
      },
    });

    // Reverse the session's denormalized credit total
    if (data.sessionId) {
      await tx.osintSession.update({
        where: { id: data.sessionId },
        data: { creditsSpent: { decrement: amount } },
      });
    }

    return txn;
  },

  // Admin grant — adds credits to an agent's balance (uses its own transaction)
  async grant(agentId: number, amount: number, reason?: string) {
    const user = await prisma.user.findUnique({ where: { id: agentId } });
    if (!user) throw new NotFoundError('User not found');

    return prisma.$transaction(async (tx) => {
      const [lockedUser] = await tx.$queryRaw<{ id: number; creditBalance: number }[]>`
        SELECT id, "creditBalance" FROM "User" WHERE id = ${agentId} FOR UPDATE
      `;
      if (!lockedUser) throw new NotFoundError('User not found');
      const newBalance = lockedUser.creditBalance + amount;

      await tx.user.update({ where: { id: agentId }, data: { creditBalance: newBalance } });
      return tx.creditTransaction.create({
        data: {
          agentId,
          amount, // positive = grant
          kind: 'GRANT',
          sessionId: null,
          reason: reason ?? null,
          balanceAfter: newBalance,
        },
      });
    });
  },
};
