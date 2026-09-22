import { describe, it, expect } from "vitest";
import { requestCache } from "@/lib/requestCache";

describe("requestCache", () => {
  it("still calls the wrapped function and returns its result", async () => {
    const fn = async (n: number) => n * 2;
    const wrapped = requestCache(fn);
    expect(await wrapped(21)).toBe(42);
  });

  it("falls back to the plain function when React.cache isn't callable", async () => {
    // Under Vitest's plain Node module resolution, the pinned React 18.3.1
    // package does not export `cache` (ACTION_PLAN.md G4.3) — this is
    // exactly the environment requestCache exists to degrade gracefully in,
    // so every call here genuinely exercises the fallback path, not a mock.
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return calls;
    };
    const wrapped = requestCache(fn);
    const [a, b] = await Promise.all([wrapped(), wrapped()]);
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(calls).toBe(2);
  });
});
