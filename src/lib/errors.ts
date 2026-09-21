/**
 * The one way this application reports an expected failure.
 *
 * Before this existed there were two conventions — `throw new Error(string)` in
 * the change-order and crew-request actions, `redirect("?error=...")` in jobs
 * and auth — and no error boundary to catch either. Every throw blanked the
 * screen.
 *
 * ## Why the digest
 *
 * Next.js redacts server-side error messages in production: the boundary
 * receives a generic "an error occurred" and a hashed `digest`, so a thrown
 * message cannot be read on the client. It does, however, pass a `digest` the
 * error already carries straight through — this is the same mechanism Next's
 * own `notFound()` and `redirect()` use with `NEXT_NOT_FOUND` and
 * `NEXT_REDIRECT`.
 *
 * So an `ActionError` encodes its kind and its message into `digest`, and the
 * boundary decodes them. An error that is *not* an `ActionError` has no such
 * digest, the boundary cannot decode it, and the user gets the generic state —
 * which is what should happen to an unexpected exception.
 *
 * ## The rule this places on callers
 *
 * **An `ActionError` message reaches the browser in production.** It is a
 * sentence written for the person reading it. Never put an exception message,
 * a query, a stack, an id the user has no business seeing, or anything about
 * the shape of the database into one. If the detail is for the operator, log
 * it and throw a plain `Error`; the boundary will show the generic state and
 * the digest will let you find it in the logs.
 */

export type ActionErrorKind =
  /** The user is signed in but not allowed to do this. */
  | "forbidden"
  /** The record does not exist, or is not one this user can reach. */
  | "not-found"
  /** The submission was rejected. */
  | "invalid"
  /** Someone else changed the record first. */
  | "conflict";

const PREFIX = "OC_ERR";
const SEP = "|";

export class ActionError extends Error {
  readonly kind: ActionErrorKind;
  /** Read by the Next.js error boundary. See the note above. */
  readonly digest: string;

  constructor(kind: ActionErrorKind, message: string) {
    super(message);
    this.name = "ActionError";
    this.kind = kind;
    this.digest = [PREFIX, kind, encodeURIComponent(message)].join(SEP);
  }
}

/** True for an `ActionError` raised in this process. */
export function isActionError(err: unknown): err is ActionError {
  return err instanceof ActionError;
}

/**
 * Recover the kind and message from an error that has crossed the server /
 * client boundary, where only `digest` survives. Returns null for anything
 * this application did not raise deliberately.
 */
export function decodeActionError(
  err: { digest?: string } | null | undefined
): { kind: ActionErrorKind; message: string } | null {
  const digest = err?.digest;
  if (!digest || !digest.startsWith(PREFIX + SEP)) return null;

  const parts = digest.split(SEP);
  if (parts.length < 3) return null;

  const kind = parts[1] as ActionErrorKind;
  if (!["forbidden", "not-found", "invalid", "conflict"].includes(kind)) return null;

  try {
    // Re-join the remainder: a message is encoded, so it cannot itself contain
    // a separator, but splitting defensively costs nothing.
    return { kind, message: decodeURIComponent(parts.slice(2).join(SEP)) };
  } catch {
    return null;
  }
}

export function forbidden(message = "You do not have permission to do that."): ActionError {
  return new ActionError("forbidden", message);
}

export function notFound(what = "That record"): ActionError {
  return new ActionError("not-found", `${what} could not be found.`);
}

export function invalid(message: string): ActionError {
  return new ActionError("invalid", message);
}

export function conflict(
  message = "Someone else changed this while you were working on it. Reload and try again."
): ActionError {
  return new ActionError("conflict", message);
}

/** How each kind is presented. Shared by every boundary. */
export const ACTION_ERROR_TITLE: Record<ActionErrorKind, string> = {
  forbidden: "Not permitted",
  "not-found": "Not found",
  invalid: "That did not work",
  conflict: "Changed by someone else",
};
