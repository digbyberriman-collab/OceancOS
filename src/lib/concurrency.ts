/** Thrown by `Semaphore.acquire()` when the queue is already at its limit. */
export class QueueFullError extends Error {
  constructor(message = "Too many requests queued.") {
    super(message);
    this.name = "QueueFullError";
  }
}

/**
 * Bounds how many callers can hold a slot at once. Callers past the limit
 * wait in a queue up to `maxQueue` deep; beyond that, `acquire()` rejects
 * immediately rather than growing the queue without bound.
 *
 * Extracted out of `lib/export/pdf.ts` (ACTION_PLAN.md G4.7) so the queueing
 * logic — the part actually worth testing — doesn't require launching a
 * real browser to exercise.
 */
export class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueue: number
  ) {}

  async acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return;
    }
    if (this.waiters.length >= this.maxQueue) {
      throw new QueueFullError();
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  /** Free a slot, handing it straight to the next queued waiter if there is one. */
  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) next();
  }

  get activeCount(): number {
    return this.active;
  }

  get queueLength(): number {
    return this.waiters.length;
  }
}
