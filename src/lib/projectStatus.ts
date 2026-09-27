// Whether a project still takes new work.
//
// A COMPLETED project is the record of a yard period that has finished — a
// historical refit, a dry-dock ten years ago. Raising a change order, a crew
// request or a quote request against it would put new work into history, so
// the create actions refuse and the pages offer no button. ACTIVE and
// PLANNED projects take new work: quotes and change orders are raised before
// a vessel arrives as much as during the stay.

import { conflict } from "./errors";

type StatusProject = { status: string; code?: string | null; name: string };

export function isProjectWritable(project: { status: string }): boolean {
  return project.status !== "COMPLETED";
}

export function completedProjectMessage(project: StatusProject): string {
  return (
    `${project.code ?? project.name} is a completed yard period, kept as a record. ` +
    "Raise new work on a current project instead."
  );
}

/** Refuse new work on a completed project. */
export function assertProjectWritable(project: StatusProject): void {
  if (!isProjectWritable(project)) throw conflict(completedProjectMessage(project));
}
