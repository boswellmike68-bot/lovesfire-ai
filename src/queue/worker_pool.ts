/**
 * Worker Pool — Concurrency governor for render jobs.
 *
 * Controls how many jobs execute in parallel. When a worker finishes,
 * the pool automatically dispatches the next queued task.
 */

export class WorkerPool {
  private activeWorkers = 0;
  private pending: Array<() => void> = [];

  constructor(private readonly maxWorkers: number) {}

  get active(): number {
    return this.activeWorkers;
  }

  get queueDepth(): number {
    return this.pending.length;
  }

  /**
   * Run a task when a worker slot is available.
   * If all slots are busy, the task waits in the internal queue.
   * Returns a promise that resolves when the task completes.
   */
  async run<T>(task: () => Promise<T>): Promise<T> {
    // Wait for a free slot
    if (this.activeWorkers >= this.maxWorkers) {
      await new Promise<void>((resolve) => {
        this.pending.push(resolve);
      });
    }

    this.activeWorkers++;
    try {
      return await task();
    } finally {
      this.activeWorkers--;
      // Release the next waiting task
      const next = this.pending.shift();
      if (next) next();
    }
  }
}
