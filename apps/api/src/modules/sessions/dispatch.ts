import type { JobData } from '../../worker/contracts';
import { enqueueTask } from '../../worker/queue';

export async function dispatchTasks(rows: JobData[]): Promise<void> {
  if (rows.length === 0) return;
  await Promise.allSettled(rows.map((row) => enqueueTask(row)));
}
