import {
  Crown,
  UserCheck,
  ClipboardList,
  Anchor,
  Wrench,
  Users,
  HardHat,
  Calculator,
  Hammer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

type Role = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const ROLES: Role[] = [
  {
    icon: Crown,
    title: "Owner",
    body: "Top-line oversight of spend, schedule and the decisions awaiting sign-off.",
  },
  {
    icon: UserCheck,
    title: "Owner's Rep",
    body: "Reviews and gates change orders on the owner's behalf before authorization.",
  },
  {
    icon: ClipboardList,
    title: "Project Manager",
    body: "Drives the programme, owns the schedule and routes work through approvals.",
  },
  {
    icon: Anchor,
    title: "Captain",
    body: "Aligns vessel operations and crew needs with the refit plan in real time.",
  },
  {
    icon: Wrench,
    title: "Chief Engineer",
    body: "Tracks technical scope, systems work and engineering-led change requests.",
  },
  {
    icon: Users,
    title: "Crew",
    body: "Raises requests and reports issues directly into the project workflow.",
  },
  {
    icon: HardHat,
    title: "Yard PM",
    body: "Coordinates yard delivery, prices variations and updates work status.",
  },
  {
    icon: Calculator,
    title: "Finance",
    body: "Monitors committed, forecast and actual cost with live variance to plan.",
  },
  {
    icon: Hammer,
    title: "Contractor",
    body: "Receives scoped tasks and reports progress without seeing the whole book.",
  },
];

export function Roles() {
  return (
    <section id="pricing" className="scroll-mt-20 border-t border-line bg-ink-950/40 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="Built for Every Stakeholder"
          title="One Workspace, Nine Roles, Zero Blind Spots"
          description="Everyone from the owner to the contractor works in the same system — each with a view scoped precisely to their responsibility."
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="surface surface-hover flex gap-4 p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-ink-850 text-marine">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold tracking-tight text-white">
                  {title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-pretty text-muted">
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
