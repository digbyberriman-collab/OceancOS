// One-shot form state, carried across the redirect a validation failure
// still issues.
//
// ACTION_PLAN.md G3.6: "preserve submitted values on validation failure
// instead of discarding the form." The framework-idiomatic fix — return
// `{error, values}` from the action and re-render via `useActionState` — is
// React 19 only; this app is pinned to React 18 / Next.js 14 (the Next 16 /
// React 19 upgrade is its own deferred item). This is the same "flash"
// pattern web frameworks have used for this exact problem since long before
// any of them had a hook for it: the action stashes what it needs in a
// short-lived cookie before redirecting, and the page that receives the
// redirect reads it once and renders the form exactly as the user left it,
// error included.
//
// The cookie is cleared by `<FlashCleanup>` (components/ui/FlashCleanup.tsx)
// rather than here: Next.js only allows mutating cookies from a Server
// Action, Route Handler or Middleware, never during a Server Component's own
// render, so a page reading its flash cannot also delete it in the same
// pass. `FlashCleanup` does the equivalent from the client the moment the
// page mounts, which is also why the cookie isn't httpOnly — this data
// (typed field values, an error string) isn't sensitive enough to justify
// the alternative (a middleware step on every request) just to keep it out
// of client-readable storage for the few hundred milliseconds until mount.
//
// Stays under the ~4KB per-cookie ceiling for everything this app's forms
// actually hold; a caller with a very large free-text field should trim
// what it stashes rather than pass the whole thing through.

import { cookies } from "next/headers";
import { flashCookieName } from "./formFlashName";

const MAX_AGE_SECONDS = 120;

export { flashCookieName };

/** Stash `data` for exactly one read, keyed by `key`. Call before redirecting. */
export function setFormFlash(key: string, data: unknown): void {
  cookies().set(flashCookieName(key), JSON.stringify(data), {
    httpOnly: false,
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

/**
 * Read the stash for `key`, if any. Pair with `<FlashCleanup name={...}>` in
 * the page so it doesn't linger for the next unrelated visit.
 */
export function readFormFlash<T>(key: string): T | null {
  const raw = cookies().get(flashCookieName(key))?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
