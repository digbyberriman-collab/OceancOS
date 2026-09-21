"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Lock, SearchX, RefreshCw } from "lucide-react";
import { decodeActionError, ACTION_ERROR_TITLE } from "@/lib/errors";

/**
 * The authenticated shell's error boundary.
 *
 * It renders inside the layout, so the sidebar and the project switcher stay
 * where they were and the user is never stranded on a blank page.
 *
 * An `ActionError` carries its kind and its message through `digest`, which is
 * the only thing Next.js preserves across the server/client boundary in
 * production. Anything else is an unexpected exception: the user gets a generic
 * apology and the digest, which is the string to search the logs for.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const known = decodeActionError(error);

  useEffect(() => {
    if (!known) {
      // eslint-disable-next-line no-console
      console.error("[boundary]", error);
    }
  }, [error, known]);

  const Icon = !known
    ? AlertTriangle
    : known.kind === "forbidden"
      ? Lock
      : known.kind === "not-found"
        ? SearchX
        : AlertTriangle;

  return (
    <div className="surface mx-auto max-w-xl p-10 text-center animate-fade-in">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-ink-800 text-muted ring-1 ring-line">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>

      <h1 className="text-base font-semibold text-white">
        {known ? ACTION_ERROR_TITLE[known.kind] : "Something went wrong"}
      </h1>

      <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-muted">
        {known
          ? known.message
          : "This page could not be loaded. The problem has been recorded; nothing you entered was saved."}
      </p>

      {!known && error.digest && (
        <p className="mt-3 font-mono text-[11px] text-faint">Reference {error.digest}</p>
      )}

      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={reset} className="btn-primary">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
        <Link href="/dashboard" className="btn">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
