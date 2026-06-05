import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/marketing/Nav";
import { Hero } from "@/components/marketing/Hero";
import { TrustBar } from "@/components/marketing/TrustBar";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { Workflow } from "@/components/marketing/Workflow";
import { Stats } from "@/components/marketing/Stats";
import { Security } from "@/components/marketing/Security";
import { Roles } from "@/components/marketing/Roles";
import { CTA } from "@/components/marketing/CTA";
import { Footer } from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "OceancOS — The Operating System for Superyacht Projects",
  description:
    "OceancOS unifies change orders, multi-stage approvals, budgets and schedules for superyacht refit, new build and conversion projects — one command centre with a full audit trail.",
};

export default async function Root() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-ink-950 text-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ink-800 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      <Nav />

      <main id="main">
        <Hero />
        <TrustBar />
        <FeatureGrid />
        <Workflow />
        <Stats />
        <Security />
        <Roles />
        <CTA />
      </main>

      <Footer />
    </div>
  );
}
