"use client";

import { useState } from "react";
import { Printer, Loader2, AlertCircle } from "lucide-react";

/**
 * The PDF export routes (`/api/export/{jobs,change-orders}/[id]`) return a
 * JSON error body — `{ error, detail, hint }` — when Playwright's Chromium
 * isn't available, at 503. The button used to be a plain `<a target="_blank">`,
 * so that failure opened a new tab showing the raw JSON instead of the PDF
 * (ACTION_PLAN.md G3.7, [ERROR STATES]). Fetching client-side instead means a
 * failure can be shown inline, without ever printing `detail`/`hint` — server
 * internals — into the page.
 */
export function PdfButton({ href, className = "btn" }: { href: string; className?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        setError("Could not render the PDF. Try again shortly.");
        setState("error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setState("idle");
    } catch {
      setError("Could not reach the server.");
      setState("error");
    }
  }

  return (
    <div className="relative inline-flex">
      <button type="button" onClick={open} disabled={state === "loading"} className={className}>
        {state === "loading" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Printer size={14} />}
        PDF
      </button>
      {state === "error" && error && (
        <div
          role="alert"
          className="absolute right-0 top-full z-10 mt-1.5 w-64 rounded-lg border border-bad/30 bg-ink-900 px-3 py-2 text-xs text-bad shadow-lg"
        >
          <div className="flex items-start gap-1.5">
            <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
