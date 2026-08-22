import { env } from '../config/env';
import type { JobKind } from './contracts';

export interface QueueSpec {
  concurrency: number;
  limiter?: { max: number; duration: number };
  attempts: number;
  backoff: { type: 'exponential'; delay: number };
}

export const DEFAULT_SPEC: QueueSpec = {
  concurrency: 2,
  limiter: { max: 30, duration: 60_000 },
  attempts: 3,
  backoff: { type: 'exponential', delay: 10_000 },
};

function githubSpec(githubToken: string | undefined): QueueSpec {
  const hasToken = Boolean(githubToken);
  return {
    concurrency: hasToken ? 5 : 1,
    limiter: hasToken ? { max: 80, duration: 60_000 } : { max: 45, duration: 3_600_000 },
    attempts: 4,
    backoff: { type: 'exponential', delay: 10_000 },
  };
}

export function buildQueueSpecs(
  githubToken: string | undefined = env.GITHUB_TOKEN
): Record<string, QueueSpec> {
  return {
    'scout:web_search': {
      concurrency: 4,
      limiter: { max: 10, duration: 60_000 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    },
    'scout:github': githubSpec(githubToken),
    'scout:instagram': {
      concurrency: 1,
      limiter: { max: 12, duration: 60_000 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
    },
  };
}

export function routeJob(data: { kind: JobKind; platform?: string }): string {
  switch (data.kind) {
    case 'WEB_SEARCH':
      return 'scout:web_search';
    case 'SCRAPE':
      return `scout:${(data.platform ?? '').toLowerCase()}`;
    default:
      return `scout:${data.kind.toLowerCase()}`;
  }
}

export function getSpec(
  queueName: string,
  specs: Record<string, QueueSpec> = buildQueueSpecs()
): QueueSpec {
  return specs[queueName] ?? DEFAULT_SPEC;
}
