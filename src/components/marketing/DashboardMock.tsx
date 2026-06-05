import {
  FileStack,
  CheckCircle2,
  Wallet,
  CalendarRange,
  ArrowUpRight,
} from "lucide-react";

const STAGES = [
  { label: "Submitted", pct: 100, tone: "bg-marine" },
  { label: "PM Review", pct: 100, tone: "bg-accent-bright" },
  { label: "Owner's Rep", pct: 64, tone: "bg-accent" },
  { label: "Owner Sign-off", pct: 22, tone: "bg-accent-soft" },
];

const ROWS = [
  { id: "CO-0481", title: "Bridge console rewire", amount: "$84,200", state: "Approved", tone: "badge-ok" },
  { id: "CO-0479", title: "Teak deck replacement", amount: "$612,000", state: "In Review", tone: "badge-warn" },
  { id: "CO-0477", title: "Stabilizer fin upgrade", amount: "$248,500", state: "Pending", tone: "badge-info" },
];

/** Abstract product mock — composed entirely from divs/SVG, no external assets. */
export function DashboardMock() {
  return (
    <div className="relative">
      {/* Ambient glow behind the panel */}
      <div
        aria-hidden="true"
        className="absolute -inset-x-8 -top-10 bottom-0 -z-10 bg-radial-glow blur-2xl"
      />

      <div className="surface panel-glow overflow-hidden rounded-2xl bg-ink-900/90">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-bad/70" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-warn/70" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-ok/70" aria-hidden="true" />
          <div className="ml-3 flex items-center gap-2 text-xs text-faint">
            <span className="rounded-md border border-line bg-ink-850 px-2 py-0.5 font-mono">
              M/Y Meridian · Refit 2026
            </span>
          </div>
        </div>

        <div className="grid gap-px bg-line sm:grid-cols-[1.4fr_1fr]">
          {/* Left: change order table */}
          <div className="bg-ink-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <FileStack className="h-4 w-4 text-marine" aria-hidden="true" />
                Change Orders
              </div>
              <span className="badge badge-muted tnum">12 open</span>
            </div>
            <div className="space-y-2">
              {ROWS.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-line-soft bg-ink-850/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] text-faint">{r.id}</div>
                    <div className="truncate text-[13px] font-medium text-white">
                      {r.title}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 pl-3">
                    <span className="tnum text-[13px] font-semibold text-white">
                      {r.amount}
                    </span>
                    <span className={`badge ${r.tone}`}>{r.state}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: approval flow + stats */}
          <div className="space-y-4 bg-ink-900 p-4">
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <CheckCircle2 className="h-4 w-4 text-marine" aria-hidden="true" />
                Approval Flow
              </div>
              <div className="space-y-2.5">
                {STAGES.map((s) => (
                  <div key={s.label}>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                      <span>{s.label}</span>
                      <span className="tnum text-faint">{s.pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                      <div
                        className={`h-full rounded-full ${s.tone}`}
                        style={{ width: `${s.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-line-soft bg-ink-850/60 p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-muted">
                  <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Committed
                </div>
                <div className="tnum mt-1 text-lg font-semibold text-white">
                  $18.4M
                </div>
                <div className="flex items-center gap-1 text-[11px] text-ok">
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> 4.2% to plan
                </div>
              </div>
              <div className="rounded-lg border border-line-soft bg-ink-850/60 p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-muted">
                  <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" /> On schedule
                </div>
                <div className="tnum mt-1 text-lg font-semibold text-white">
                  92%
                </div>
                <div className="text-[11px] text-faint">3 milestones at risk</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating accent chip */}
      <div className="absolute -bottom-4 -left-4 hidden animate-fade-up items-center gap-2 rounded-xl border border-line bg-ink-850 px-3 py-2 shadow-floating sm:flex">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-ok/15 text-ok">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <div className="text-[11px] font-medium text-white">CO-0481 approved</div>
          <div className="text-[10px] text-faint">Owner sign-off · 2m ago</div>
        </div>
      </div>
    </div>
  );
}
