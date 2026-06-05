import { Anchor, ShieldCheck, Activity, Layers } from "lucide-react";
import { BrandMark } from "./BrandMark";

const FEATURES = [
  {
    icon: Layers,
    title: "One command centre",
    body: "Refit and new-build programmes, schedules, and deliverables in a single source of truth.",
  },
  {
    icon: Activity,
    title: "Live project signal",
    body: "Track variations, milestones, and yard progress as they happen — no spreadsheet lag.",
  },
  {
    icon: ShieldCheck,
    title: "Audited and access-controlled",
    body: "Role-based permissions and a full audit trail for owners, yards, and crew alike.",
  },
];

export function BrandPanel() {
  return (
    <section className="relative hidden overflow-hidden bg-ink-950 lg:flex lg:flex-col lg:justify-between">
      {/* Ambient layers */}
      <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:32px_32px]" />
      <div className="pointer-events-none absolute inset-0 bg-radial-glow" />
      <div
        className="pointer-events-none absolute -left-24 top-1/3 h-[460px] w-[460px] rounded-full opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(56,189,248,0.18) 0%, rgba(59,130,246,0.10) 45%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* Header / brand lockup */}
      <div className="relative z-10 flex items-center gap-3 px-12 pt-12 animate-fade-in">
        <BrandMark className="h-10 w-10" />
        <span className="text-base font-semibold tracking-tight text-white">OceancOS</span>
      </div>

      {/* Value proposition */}
      <div className="relative z-10 px-12 pb-4 animate-fade-up">
        <p className="eyebrow mb-5">
          <Anchor className="h-3.5 w-3.5" />
          Superyacht operations
        </p>
        <h2 className="max-w-xl text-balance text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
          The operational command centre for{" "}
          <span className="gradient-text">refit &amp; new build</span> projects.
        </h2>
        <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-muted">
          Bring owners, captains, yards, and contractors onto one calm, precise
          platform — from first survey to sea trials.
        </p>

        <ul className="mt-10 space-y-5">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3.5">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-ink-900/70 text-marine">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{title}</p>
                <p className="mt-0.5 text-pretty text-[13px] leading-relaxed text-muted">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer trust line */}
      <div className="relative z-10 px-12 pb-12 pt-8">
        <div className="hairline pt-6">
          <p className="text-xs text-faint">
            Trusted across new builds and refits worldwide.
          </p>
        </div>
      </div>
    </section>
  );
}
