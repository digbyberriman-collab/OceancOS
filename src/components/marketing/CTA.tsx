import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CTA() {
  return (
    <section id="demo" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="surface panel-glow relative overflow-hidden px-6 py-16 text-center sm:px-12 sm:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-radial-glow"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-grid-faint [mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)]"
          />

          <span className="eyebrow justify-center">Ready When You Are</span>
          <h2 className="mx-auto mt-4 max-w-2xl font-display text-3xl font-bold tracking-tight text-balance text-white sm:text-4xl">
            Bring Your Next Project Under{" "}
            <span className="gradient-text">One Command Centre</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-pretty text-muted">
            See how OceancOS unifies change orders, approvals, budgets and
            schedules for your fleet. Book a guided walkthrough with our team.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="mailto:hello@oceancos.com?subject=OceancOS%20Demo%20Request" className="btn-primary btn-lg">
              Request a Demo
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <Link href="/login" className="btn btn-lg">
              Sign In to Workspace
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
