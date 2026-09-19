"use client";

import { useRef } from "react";
import { Ship, ChevronDown } from "lucide-react";
import { setActiveProjectAction } from "@/app/(app)/_actions";
import type { ProjectSummary } from "@/lib/project";

/**
 * Header project selector, mirroring The Bridge's project-code dropdown.
 *
 * A plain form posting to a server action: no client state, works without
 * JavaScript, and submits on change when JavaScript is available.
 */
export function ProjectSwitcher({
  projects,
  activeId,
}: {
  projects: ProjectSummary[];
  activeId: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  if (!projects.length) return null;

  const active = projects.find((p) => p.id === activeId) ?? projects[0];

  // A single project needs no control — show it as a static label.
  if (projects.length === 1) {
    return (
      <div className="hidden items-center gap-2 rounded-lg border border-line bg-ink-900/60 px-3 py-1.5 md:flex">
        <Ship className="h-3.5 w-3.5 shrink-0 text-marine" aria-hidden />
        <span className="text-xs leading-tight">
          <span className="font-medium text-white">{active.code ?? active.name}</span>
          <span className="ml-1.5 text-faint">{active.vesselName}</span>
        </span>
      </div>
    );
  }

  return (
    <form ref={formRef} action={setActiveProjectAction} className="hidden md:block">
      <label className="group relative flex items-center gap-2 rounded-lg border border-line bg-ink-900/60 px-3 py-1.5 transition-colors hover:border-line-strong">
        <Ship className="h-3.5 w-3.5 shrink-0 text-marine" aria-hidden />
        <span className="sr-only">Active project</span>
        <select
          name="projectId"
          defaultValue={active.id}
          onChange={() => formRef.current?.requestSubmit()}
          className="cursor-pointer appearance-none bg-transparent pr-5 text-xs font-medium text-white focus:outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id} className="bg-ink-900 text-white">
              {p.code ? `${p.code} · ` : ""}
              {p.vesselName} — {p.name}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-faint"
          aria-hidden
        />
        {/* Fallback for browsers without JavaScript. */}
        <noscript>
          <button className="btn-ghost ml-1 text-xs">Switch</button>
        </noscript>
      </label>
    </form>
  );
}
