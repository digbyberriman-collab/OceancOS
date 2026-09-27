import * as React from "react";

/**
 * `React.cache()` when it's actually callable, falling back to the function
 * itself — uncached — when it isn't.
 *
 * Next.js's own bundled React provides a working `cache()` at runtime (the
 * app and its e2e suite both prove this: dashboard charts render correctly
 * with data pulled through `getActiveProject`/`listProjectsForUser`, which
 * are wrapped below). But the `react` package actually pinned in
 * package.json — 18.3.1 stable — does not export `cache` under plain Node
 * module resolution, which is what Vitest uses. Importing `cache` directly
 * throws `TypeError: cache is not a function` at module load time under
 * `npm run test`, before any test body runs (ACTION_PLAN.md G4.3).
 *
 * Falling back to the plain function is the correct behaviour for tests
 * anyway: a unit test wants a fresh call every time, not one memoized
 * against whatever the last test happened to pass as an argument.
 */
export function requestCache<T extends (...args: never[]) => unknown>(fn: T): T {
  const maybeCache = (React as { cache?: <F>(f: F) => F }).cache;
  return typeof maybeCache === "function" ? maybeCache(fn) : fn;
}
