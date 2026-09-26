import Link from "next/link";
import { SearchX } from "lucide-react";

/**
 * A record looked up inside the app and not found. Renders within the shell, so
 * navigation and the chosen theme stay; unmatched URLs still use the root page.
 */
export default function AppNotFound() {
  return (
    <div className="surface mx-auto max-w-md p-10 text-center">
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
  );
}
