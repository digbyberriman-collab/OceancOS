import { FlaskConical } from "lucide-react";

/**
 * Shown on every page while the active project is in the demo workspace.
 *
 * The demo is fictional walkthrough data parked on Draak (src/lib/demo/).
 * Lists and totals already cover only the demo side while it is active
 * (projectScope), so nothing real is mixed in; this says so, and says how to
 * get back to real vessels.
 */
export function DemoBanner({ vesselName }: { vesselName: string }) {
  return (
    <div
      role="note"
      aria-label="Demo workspace"
      className="border-b border-warn/30 bg-warn/10 px-4 py-2 text-xs text-warn"
    >
      <div className="mx-auto flex max-w-[1400px] items-start gap-2">
        <FlaskConical className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">Demo workspace.</span> Everything shown while this project
          is active is fictional walkthrough data, parked on {vesselName}. It is not part of{" "}
          {vesselName}&rsquo;s history and never appears in a real vessel&rsquo;s lists or totals.
          Choose a real project in the header to leave it.
        </p>
      </div>
    </div>
  );
}
