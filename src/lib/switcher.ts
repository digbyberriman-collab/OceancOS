// How the header's project switcher lays out the projects a user can reach.
//
// Pure, so the grouping is testable without rendering. The switcher is for
// choosing where to work: live projects (active and planned) grouped by
// vessel, with the fictional demo workspace in a group of its own so it is
// never mistaken for a real vessel's. Completed yard periods are records,
// opened from the vessel's history, and are left out — unless one is the
// active project, which then shows under a read-only history group so the
// control can still say where the user is.

import type { ProjectSummary } from "./project";

export type SwitcherGroup = { key: string; label: string; projects: ProjectSummary[] };

export const DEMO_GROUP_LABEL = "Demo workspace — fictional";
export const HISTORY_GROUP_LABEL = "History (read-only)";

function vesselLabel(p: ProjectSummary): string {
  return p.vesselYardNumber ? `${p.vesselYardNumber} · ${p.vesselName}` : p.vesselName;
}

/** The projects the switcher offers, in groups, keeping the order they came in. */
export function switcherGroups(
  projects: ProjectSummary[],
  activeId: string | null,
): SwitcherGroup[] {
  const offered = projects.filter((p) => p.status !== "COMPLETED" || p.id === activeId);

  const demo = offered.filter((p) => p.isDemo);
  const history = offered.filter((p) => !p.isDemo && p.status === "COMPLETED");
  const live = offered.filter((p) => !p.isDemo && p.status !== "COMPLETED");

  const byVessel = new Map<string, SwitcherGroup>();
  for (const p of live) {
    const group = byVessel.get(p.vesselId) ?? {
      key: `vessel-${p.vesselId}`,
      label: vesselLabel(p),
      projects: [],
    };
    group.projects.push(p);
    byVessel.set(p.vesselId, group);
  }
  const vessels = [...byVessel.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "en", { numeric: true }),
  );

  return [
    ...(demo.length ? [{ key: "demo", label: DEMO_GROUP_LABEL, projects: demo }] : []),
    ...vessels,
    ...(history.length ? [{ key: "history", label: HISTORY_GROUP_LABEL, projects: history }] : []),
  ];
}

/** Every project the switcher offers, flattened. */
export function switcherProjects(
  projects: ProjectSummary[],
  activeId: string | null,
): ProjectSummary[] {
  return switcherGroups(projects, activeId).flatMap((g) => g.projects);
}
