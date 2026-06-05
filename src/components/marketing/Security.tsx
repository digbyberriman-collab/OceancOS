import { ShieldCheck, ScrollText, KeyRound, Lock, Fingerprint, History } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

type Item = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const ITEMS: Item[] = [
  {
    icon: KeyRound,
    title: "Role-Based Access Control",
    body: "Nine stakeholder roles, each scoped to exactly what they should see and do — from full owner oversight down to contractor task access.",
  },
  {
    icon: History,
    title: "Immutable Audit Log",
    body: "Every approval, edit and status change is timestamped and attributed. Reconstruct the full history of any decision on demand.",
  },
  {
    icon: ScrollText,
    title: "Versioned Documents",
    body: "Drawings, certificates and specifications keep a complete revision history, so the current source of truth is never in question.",
  },
  {
    icon: Fingerprint,
    title: "Attributed Sign-Off",
    body: "Approvals are tied to named users and stages, giving owners and class a defensible record of who authorized what, and when.",
  },
];

export function Security() {
  return (
    <section id="security" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Security & Auditability"
              title="Built for Decisions That Have to Hold Up"
              description="A refit moves millions through dozens of hands. OceancOS keeps control tight and the record airtight, so every stakeholder can trust what they see."
            />

            <div className="mt-8 flex flex-wrap gap-3">
              <span className="badge badge-info">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Least-privilege by default
              </span>
              <span className="badge badge-ok">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Full audit trail
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {ITEMS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="surface p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-ink-850 text-marine">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-white">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-pretty text-muted">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
