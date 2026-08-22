import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/prisma';
import { connectRedis, disconnectRedis } from './lib/redis';
import { closeWorkers, startWorkers } from './worker';
import { closeQueues } from './worker/queue';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  await connectRedis();

  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info(`Server started and listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  if (env.RUN_WORKER) {
    await startWorkers();
  }

  registerShutdownHandlers();
}

function registerShutdownHandlers(): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully`);

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS).unref();

    try {
      await Promise.allSettled([closeWorkers(), closeQueues()]);
      await Promise.allSettled([disconnectDatabase(), disconnectRedis()]);
      clearTimeout(forceExit);
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection');
    void shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
