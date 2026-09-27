import { describe, it, expect } from "vitest";
import { Semaphore, QueueFullError } from "@/lib/concurrency";

describe("Semaphore", () => {
  it("lets callers through immediately up to the concurrency limit", async () => {
    const sem = new Semaphore(2, 5);
    await sem.acquire();
    await sem.acquire();
    expect(sem.activeCount).toBe(2);
    expect(sem.queueLength).toBe(0);
  });

  it("queues a caller past the limit instead of letting it through", async () => {
    const sem = new Semaphore(1, 5);
    await sem.acquire();

    let acquired = false;
    const pending = sem.acquire().then(() => {
      acquired = true;
    });

    // Still waiting: the first holder hasn't released yet.
    await Promise.resolve();
    expect(acquired).toBe(false);
    expect(sem.queueLength).toBe(1);

    sem.release();
    await pending;
    expect(acquired).toBe(true);
    expect(sem.activeCount).toBe(1);
    expect(sem.queueLength).toBe(0);
  });

  it("rejects fast once the queue itself is full, rather than growing it without bound", async () => {
    const sem = new Semaphore(1, 1);
    await sem.acquire(); // holds the one slot
    void sem.acquire().catch(() => {}); // fills the one queue slot

    await expect(sem.acquire()).rejects.toBeInstanceOf(QueueFullError);
  });

  it("hands a released slot straight to the next queued waiter, in order", async () => {
    const sem = new Semaphore(1, 5);
    await sem.acquire();

    const order: string[] = [];
    const a = sem.acquire().then(() => order.push("a"));
    const b = sem.acquire().then(() => order.push("b"));

    sem.release(); // frees the original holder's slot for "a"
    await a;
    sem.release(); // frees "a"'s slot for "b"
    await b;

    expect(order).toEqual(["a", "b"]);
  });

  it("never lets activeCount go negative on an extra release", () => {
    const sem = new Semaphore(2, 5);
    sem.release();
    sem.release();
    expect(sem.activeCount).toBe(0);
  });
});
