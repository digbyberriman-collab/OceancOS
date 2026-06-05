import { Info } from "lucide-react";

/**
 * Tasteful demo-credentials aid. Seeded logins are documented in the README.
 * Clearly marked as a demo convenience, not a security concern.
 */
export function DemoHint() {
  return (
    <div className="rounded-lg border border-line bg-ink-950/50 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <Info className="h-3.5 w-3.5 text-marine" aria-hidden="true" />
        Demo access
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        Sign in with{" "}
        <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[12px] text-white">
          owner@oceancos.dev
        </code>{" "}
        and password{" "}
        <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[12px] text-white">
          password
        </code>
        .
      </p>
    </div>
  );
}
