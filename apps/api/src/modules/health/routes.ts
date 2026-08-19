import { Elysia } from 'elysia';

import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';

export const healthRoutes = new Elysia({ prefix: '/health' })
  .get('/', () => {
    return { success: true, data: { status: 'ok', uptime: process.uptime() } };
  })
  .get('/ready', async () => {
    const [db, cache] = await Promise.all([
      ping(() => prisma.$queryRaw`SELECT 1`),
      ping(() => redis.ping()),
    ]);
    const ready = db && cache;
    return {
      success: ready,
      data: {
        status: ready ? 'ready' : 'not_ready',
        database: db ? 'up' : 'down',
        redis: cache ? 'up' : 'down',
      },
    };
  });

async function ping(check: () => Promise<unknown>): Promise<boolean> {
  try {
    await check();
    return true;
  } catch {
    return false;
  }
}
