import { PencilLine, GitPullRequestArrow, BadgeCheck, LineChart } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

type Step = {
  n: string;
  icon: LucideIcon;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    n: "01",
    icon: PencilLine,
    title: "Capture the Change",
    body: "Crew, yard PMs or contractors raise a change order with scope, cost and supporting documents attached.",
  },
  {
    n: "02",
    icon: GitPullRequestArrow,
    title: "Route for Approval",
    body: "Work flows through defined stages — PM review, owner's rep, owner sign-off — each with a clear owner and deadline.",
  },
  {
    n: "03",
    icon: BadgeCheck,
    title: "Authorize With an Audit Trail",
    body: "Every approval, comment and revision is timestamped and attributed, so the decision history is never in doubt.",
  },
  {
    n: "04",
    icon: LineChart,
    title: "See the Impact Instantly",
    body: "Approved changes update budgets, forecasts and schedule milestones automatically across the workspace.",
  },
];

export function Workflow() {
  return (
    <section
      id="workflow"
      className="scroll-mt-20 border-y border-line bg-ink-950/40 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="How It Works"
          title="From Request to Authorization, Without the Chaos"
          description="A single, transparent path for every variation — so stakeholders always know what is pending, what is approved and what it costs."
        />

        <ol className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ n, icon: Icon, title, body }) => (
            <li key={n} className="surface relative p-6">
              <span
                aria-hidden="true"
                className="font-display text-sm font-bold tracking-widest text-faint"
              >
                {n}
              </span>
              <span className="mt-4 grid h-10 w-10 place-items-center rounded-lg border border-line bg-ink-850 text-marine">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-semibold tracking-tight text-white">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-pretty text-muted">
                {body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
