import Link from "next/link";
import { SearchX } from "lucide-react";

/**
 * Reached by `notFound()` from a page that looked a record up and did not find
 * one, and by any URL that matches no route. Deliberately says nothing about
 * whether the record exists for someone else.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="surface w-full max-w-md p-10 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-ink-800 text-muted ring-1 ring-line">
          <SearchX className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="text-base font-semibold text-white">Not found</h1>
        <p className="mx-auto mt-2 max-w-sm text-pretty text-sm text-muted">
          That page does not exist, or it is not one you can reach.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/dashboard" className="btn-primary">
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
