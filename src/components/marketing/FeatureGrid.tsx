import {
  FileStack,
  CheckCircle2,
  Wallet,
  CalendarRange,
  Users,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

type Feature = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: FileStack,
    title: "Change Orders",
    body: "Raise, price and track every variation against the contract, with revisions, attachments and cost impact captured in one place.",
  },
  {
    icon: CheckCircle2,
    title: "Multi-Stage Approvals",
    body: "Route work through PM, owner's rep and owner sign-off with configurable gates, so nothing proceeds without the right authority.",
  },
  {
    icon: Wallet,
    title: "Financials & Budgets",
    body: "Track committed, forecast and actual spend by package. See variance to plan the moment a change order lands.",
  },
  {
    icon: CalendarRange,
    title: "Schedule & Milestones",
    body: "Tie deliverables to milestones and surface at-risk items early, keeping launch and delivery dates honest.",
  },
  {
    icon: Users,
    title: "Crew Requests",
    body: "Capture crew-raised work and supply requests, then triage them into the project with clear ownership and status.",
  },
  {
    icon: ShieldAlert,
    title: "Risk Register & Documents",
    body: "Log risks, link mitigations and keep every drawing, certificate and specification version-controlled and findable.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="Built for the Whole Project"
          title="Every Module a Refit Actually Needs"
          description="Replace the spreadsheets, email threads and disconnected tools with purpose-built modules that map to how a yacht project really runs."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card-interactive group p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-ink-850 text-marine transition-colors duration-150 group-hover:border-accent/40">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-white">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-pretty text-muted">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
