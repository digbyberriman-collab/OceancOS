"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { decodeActionError, ACTION_ERROR_TITLE } from "@/lib/errors";

/**
 * The public routes' error boundary — sign-in, password reset, the landing
 * page. There is no shell to preserve here, so it centres on its own.
 */
export default function RootError({
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

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="surface w-full max-w-md p-10 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-ink-800 text-muted ring-1 ring-line">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>

        <h1 className="text-base font-semibold text-white">
          {known ? ACTION_ERROR_TITLE[known.kind] : "Something went wrong"}
        </h1>

        <p className="mx-auto mt-2 max-w-sm text-pretty text-sm text-muted">
          {known ? known.message : "This page could not be loaded. Please try again."}
        </p>

        {!known && error.digest && (
          <p className="mt-3 font-mono text-[11px] text-faint">Reference {error.digest}</p>
        )}

        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={reset} className="btn-primary">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
          <Link href="/login" className="btn">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
