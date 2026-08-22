import { RateLimitError } from '@repo/scrapers/errors';
import type { ScrapeDeps, ScrapePlatform, ScraperHandler } from '@repo/scrapers/types';
import type { Worker } from 'bullmq';

import { taskRunner as defaultTaskRunner } from '../modules/sessions/task-runner';
import { classify } from './classify';
import type { JobData } from './contracts';

export interface ProcessorDeps {
  getHandler: (platform: ScrapePlatform) => ScraperHandler | undefined;
  buildScrapeDeps: () => ScrapeDeps;
  taskRunner: typeof defaultTaskRunner;
  worker: Pick<Worker, 'rateLimit'>;
  RateLimitError: typeof Worker.RateLimitError;
  isFinalAttempt: (jobData: JobData) => boolean;
}

function toScrapeInput(jobData: JobData) {
  if (jobData.kind === 'WEB_SEARCH') {
    return {
      platform: 'WEB_SEARCH' as ScrapePlatform,
      query: jobData.query,
      queryContext: jobData.queryContext,
    };
  }
  return {
    platform: jobData.platform as ScrapePlatform,
    handle: jobData.target.handle,
    displayName: jobData.target.displayName,
    profileUrl: jobData.target.profileUrl,
    locationHint: jobData.target.locationHint,
  };
}

function platformOf(jobData: JobData): ScrapePlatform {
  return jobData.kind === 'WEB_SEARCH' ? 'WEB_SEARCH' : (jobData.platform as ScrapePlatform);
}

export async function processTask(jobData: JobData, deps: ProcessorDeps): Promise<void> {
  const claimResult = await deps.taskRunner.claim(jobData.taskId, {
    expectAgentId: jobData.agentId,
    staleAfterMs: 60 * 60 * 1000,
  });

  if (!claimResult.ok) {
    return;
  }

  const platform = platformOf(jobData);
  const handler = deps.getHandler(platform);

  if (!handler) {
    await deps.taskRunner.skip(jobData.taskId, `No handler for ${platform}`, 'NOT_IMPLEMENTED');
    return;
  }

  try {
    const outcome = await handler(toScrapeInput(jobData), deps.buildScrapeDeps());
    await deps.taskRunner.finish(jobData.taskId, outcome);
  } catch (err) {
    if (err instanceof RateLimitError) {
      await deps.worker.rateLimit(err.retryAfterMs);
      throw deps.RateLimitError();
    }

    const disposition = classify(err, deps.isFinalAttempt(jobData));
    const message = err instanceof Error ? err.message : String(err);

    switch (disposition.kind) {
      case 'TERMINAL_SKIP':
        await deps.taskRunner.skip(jobData.taskId, message, disposition.code);
        return;
      case 'TERMINAL_MISS':
        await deps.taskRunner.notFound(jobData.taskId, message);
        return;
      case 'RETRY':
        await deps.taskRunner.release(jobData.taskId, 'RETRY', message);
        return;
      case 'TERMINAL_FAIL':
      default:
        await deps.taskRunner.fail(jobData.taskId, 'FAILED', message);
        return;
    }
  }
}
