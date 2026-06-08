import Link from "next/link";
import { ArrowRight, Sparkles, ShieldCheck } from "lucide-react";
import { DashboardMock } from "./DashboardMock";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-radial-glow"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-grid-faint [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-28 lg:pt-24">
        <div className="animate-fade-up">
          <span className="eyebrow">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            The Operating System for Superyacht Projects
          </span>

          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-balance text-white sm:text-5xl lg:text-6xl">
            Run Every Refit, New Build and Conversion From{" "}
            <span className="gradient-text">One Command Centre</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted">
            OceancOS unifies change orders, multi-stage approvals, budgets and
            schedules so owners, yards and crew work from a single source of
            truth — with a full audit trail on every decision.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#demo" className="btn-primary btn-lg">
              Request a Demo
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <Link href="/login" className="btn btn-lg">
              Sign In to Workspace
            </Link>
          </div>

          <div className="mt-7 flex items-center gap-2 text-sm text-faint">
            <ShieldCheck className="h-4 w-4 text-marine" aria-hidden="true" />
            Role-based access and audit logging built in from day one
          </div>
        </div>

        <div className="animate-scale-in lg:pl-4">
          <DashboardMock />
        </div>
      </div>
    </section>
  );
}
