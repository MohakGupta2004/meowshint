import { Queue } from 'bullmq';

import { env } from '../config/env';
import type { JobData } from './contracts';
import { buildQueueSpecs, getSpec, routeJob } from './queue-specs';

const queues = new Map<string, Queue>();

// BullMQ v6 rejects ':' in queue names (queue-specs.ts names them 'scout:x' for
// readability/routing) — sanitize only at the BullMQ construction boundary.
export function bullmqName(name: string): string {
  return name.replace(/:/g, '.');
}

export function createConnectionOptions() {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    db: Number(url.searchParams.get('db')) || 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export function getQueue(name: string): Queue {
  let queue = queues.get(name);
  if (queue) return queue;

  const spec = getSpec(name);
  queue = new Queue(bullmqName(name), {
    connection: createConnectionOptions(),
    defaultJobOptions: {
      attempts: spec.attempts,
      backoff: spec.backoff,
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400, count: 5000 },
    },
  });
  queues.set(name, queue);
  return queue;
}

export async function enqueueTask(data: JobData): Promise<void> {
  const queueName = routeJob(data);
  const queue = getQueue(queueName);
  await queue.add(data.kind, data, { jobId: data.taskId });
}

export async function closeQueues(): Promise<void> {
  const closing = Array.from(queues.values()).map((q) => q.close());
  await Promise.allSettled(closing);
  queues.clear();
}
