// The single write path for a status transition.
//
// Before this existed, each entity re-implemented "check legality, check
// permission, write the status" by hand, and the checks did not always
// travel together — decideChangeOrderApproval skipped the legality map
// entirely (C5, C7, C8), and two different generic transition actions could
// each be pointed at a status meant to be reached only through its own
// ceremony or decision process (C2 for jobs; the change-order equivalent
// found while building this file, logged in audit/findings-phase5.md).
// See G1.3 in ACTION_PLAN.md.
//
// CrewRequest is dispatched here too (G2.4), closing C6: the four target
// statuses that previously required no permission at all now go through the
// same legality/permission/project-access/atomic-write path as Job and
// ChangeOrder.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { assertPermission, type PermissionKey } from "@/lib/rbac";
import { requireProjectAccess } from "@/lib/project";
import { conflict, forbidden } from "@/lib/errors";
import { assertTransitionJob, JOB_GENERIC_UNREACHABLE } from "@/lib/jobs/workflow";
import { assertTransitionChangeOrder, CO_GENERIC_UNREACHABLE } from "@/lib/workflow/changeOrder";
import { assertTransitionCrewRequest, CR_GENERIC_UNREACHABLE } from "@/lib/workflow/crewRequest";
import type { JobStatus, ChangeOrderStatus, CrewRequestStatus } from "@/lib/enums";

export type TransitionEntity = "Job" | "ChangeOrder" | "CrewRequest";

/** Either the plain client or an interactive transaction's `tx`. */
type Db = typeof prisma | Prisma.TransactionClient;

const GENERIC_UNREACHABLE: Record<TransitionEntity, readonly string[]> = {
  Job: JOB_GENERIC_UNREACHABLE,
  ChangeOrder: CO_GENERIC_UNREACHABLE,
  CrewRequest: CR_GENERIC_UNREACHABLE,
};

function assertLegal(entity: TransitionEntity, from: string, to: string) {
  if (entity === "Job") assertTransitionJob(from as JobStatus, to as JobStatus);
  else if (entity === "ChangeOrder") assertTransitionChangeOrder(from as ChangeOrderStatus, to as ChangeOrderStatus);
  else assertTransitionCrewRequest(from as CrewRequestStatus, to as CrewRequestStatus);
}

export type ApplyTransitionParams = {
  entity: TransitionEntity;
  id: string;
  /** The record's own project, checked with `requireProjectAccess`. */
  projectId: string;
  from: string;
  to: string;
  actor: NonNullable<CurrentUser>;
  /** The permission `actor` must hold to make exactly this move. */
  permission: PermissionKey;
  /** Extra columns to set alongside `status`, in the same write. */
  data?: Record<string, unknown>;
  /**
   * An interactive transaction's client, to compose this write with other
   * writes (a history row, a system comment) atomically. Defaults to the
   * plain client, which is fine for a transition with no other side
   * effects to persist in the same statement.
   */
  db?: Db;
  /**
   * Set only by the one caller that IS the ceremony or decision process a
   * `GENERIC_UNREACHABLE` status is reserved for —
   * `decideChangeOrderApproval` for ChangeOrder's `APPROVED` / `REJECTED` /
   * `MORE_INFO` (G2.2). Never set this from a generic transition action;
   * doing so re-opens exactly the side door this file exists to close.
   */
  viaCeremony?: boolean;
};

/**
 * The single write path for every status change dispatched here.
 *
 * Asserts the transition is legal for the entity, refuses it outright if
 * `to` is one only its own ceremony or decision process may reach
 * (`GENERIC_UNREACHABLE` — independent of what permission the caller
 * holds — unless the caller passes `viaCeremony: true`, meaning it *is*
 * that process), asserts the actor holds `permission`, asserts the actor can reach
 * the record's project, then writes the new status conditionally on the
 * status just read: `updateMany({ where: { id, status: from } })`, and
 * throws a conflict unless exactly one row moved.
 *
 * That conditional write closes T5's lost-update class for status: a
 * second request that read the same `from` can no longer also succeed,
 * because its `where` no longer matches once the first request has already
 * moved the row.
 */
export async function applyTransition(params: ApplyTransitionParams): Promise<void> {
  const { entity, id, projectId, from, to, actor, permission, data, db = prisma, viaCeremony } = params;

  if (!viaCeremony && GENERIC_UNREACHABLE[entity].includes(to)) {
    throw forbidden(`${to.replace(/_/g, " ")} can only be reached its own way, not this action.`);
  }

  assertLegal(entity, from, to);
  assertPermission(actor, permission);
  await requireProjectAccess(actor, projectId);

  const writeData = { status: to, ...data };
  const result =
    entity === "Job"
      ? await db.job.updateMany({ where: { id, status: from }, data: writeData })
      : entity === "ChangeOrder"
      ? await db.changeOrder.updateMany({ where: { id, status: from }, data: writeData })
      : await db.crewRequest.updateMany({ where: { id, status: from }, data: writeData });

  if (result.count !== 1) {
    throw conflict();
  }
}
