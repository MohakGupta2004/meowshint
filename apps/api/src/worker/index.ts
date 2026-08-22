import { Worker } from 'bullmq';

import { logger } from '../lib/logger';
import { taskRunner } from '../modules/sessions/task-runner';
import { type JobData, jobDataSchema } from './contracts';
import { buildScrapeDeps, getHandler } from './handlers';
import { processTask } from './processor';
import { bullmqName, createConnectionOptions } from './queue';
import { buildQueueSpecs } from './queue-specs';

const workers: Worker[] = [];

export async function startWorkers(): Promise<void> {
  const specs = buildQueueSpecs();
  const connection = createConnectionOptions();

  for (const [queueName, spec] of Object.entries(specs)) {
    const worker = new Worker<JobData>(
      bullmqName(queueName),
      async (job) => {
        const jobData = jobDataSchema.parse(job.data);
        await processTask(jobData, {
          getHandler,
          buildScrapeDeps,
          taskRunner,
          worker,
          RateLimitError: Worker.RateLimitError,
          isFinalAttempt: () => job.attemptsMade >= (job.opts.attempts ?? spec.attempts),
        });
      },
      {
        connection,
        concurrency: spec.concurrency,
        limiter: spec.limiter,
      }
    );

    worker.on('error', (err) => logger.error({ err, queueName }, 'worker error'));
    workers.push(worker);
    logger.info(`worker started: ${queueName}`);
  }
}

export async function closeWorkers(): Promise<void> {
  await Promise.allSettled(workers.map((w) => w.close()));
  workers.length = 0;
}
