"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertPermission, PERMISSIONS } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { notFound as notFoundError } from "@/lib/errors";
import { DATA_GAP_STATUSES, VESSEL_VERIFICATION } from "@/lib/enums";
import { canReachVessel, vesselIdsForUser } from "@/lib/vessels/access";
import { changedFields, observationText, parseVesselForm } from "@/lib/vessels/edit";
import { vesselField, type VesselParticulars } from "@/lib/vessels/fields";

function back(path: string, params: Record<string, string>): never {
  const query = new URLSearchParams(params).toString();
  redirect(`${path}${query ? `?${query}` : ""}`);
}

/**
 * Save a vessel's particulars.
 *
 * A changed value does not simply replace the old one: it is also recorded as
 * an observation with the basis the editor gave, so the evidence behind every
 * figure keeps growing rather than being overwritten.
 */
export async function updateVesselAction(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.VESSEL_EDIT);

  const id = String(formData.get("id") ?? "");
  if (!id || !(await canReachVessel(user.id, id))) throw notFoundError("That vessel");
  const editPath = `/vessels/${id}/edit`;

  const existing = await prisma.vessel.findUnique({ where: { id } });
  if (!existing) throw notFoundError("That vessel");

  const input: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") input[key] = value;

  const { data, problems } = parseVesselForm(input);
  if (problems.length) back(editPath, { err: problems[0].message });

  const verification = String(formData.get("verification") ?? existing.verification);
  if (!(VESSEL_VERIFICATION as readonly string[]).includes(verification)) {
    back(editPath, { err: "Choose a verification status from the list." });
  }

  const changed = changedFields(existing as unknown as Partial<VesselParticulars>, data);
  if (!changed.length && verification === existing.verification) back(`/vessels/${id}`, { saved: "0" });

  const basis = String(formData.get("basis") ?? "").trim() || "Entered in OceancOS";
  const now = new Date();
  const patch = Object.fromEntries(changed.map((key) => [key, data[key]]));

  try {
    await prisma.$transaction([
      prisma.vessel.update({
        where: { id },
        data: { ...patch, verification, updatedById: user.id },
      }),
      prisma.vesselObservation.createMany({
        data: changed
          .map((key) => ({ key, text: observationText(data[key] as never) }))
          .filter((c): c is { key: typeof c.key; text: string } => c.text != null)
          .map(({ key, text }) => {
            const field = vesselField(key);
            return {
              vesselId: id,
              fieldKey: key,
              fieldLabel: field.label,
              value: text,
              unit: field.unit ?? null,
              basis,
              observedOn: now,
              origin: "MANUAL",
              createdById: user.id,
              fingerprint: createHash("sha256")
                .update(["manual", id, key, text, user.id, now.toISOString()].join("␟"))
                .digest("hex"),
            };
          }),
      }),
    ]);
  } catch (e) {
    // IMO and yard number are unique across the fleet.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      back(editPath, { err: "Another vessel already has that IMO number or yard number." });
    }
    throw e;
  }

  await recordAudit({
    actorId: user.id,
    action: "UPDATE",
    resource: "Vessel",
    resourceId: id,
    details: {
      changed,
      before: Object.fromEntries(changed.map((k) => [k, (existing as Record<string, unknown>)[k] ?? null])),
      after: patch,
      verification,
      basis,
    },
  });

  // The header switcher, dashboard strip and register all read these.
  revalidatePath("/", "layout");
  back(`/vessels/${id}`, { saved: "1" });
}

/** Move a data gap along: open, in progress, closed — with the evidence that closed it. */
export async function updateDataGapAction(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.VESSEL_EDIT);

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const resolutionNote = String(formData.get("resolutionNote") ?? "").trim() || null;
  const requested = String(formData.get("returnTo") ?? "");
  // Only ever return to a vessel page, never to an address supplied from outside.
  const returnTo = /^\/vessels?(\/[\w-]+)?$/.test(requested) ? requested : "/vessels";

  const gap = await prisma.vesselDataGap.findUnique({ where: { id } });
  if (!gap) throw notFoundError("That data gap");

  // A vessel's gap needs that vessel; a fleet-level gap needs any register vessel.
  const reachable = gap.vesselId
    ? await canReachVessel(user.id, gap.vesselId)
    : (await vesselIdsForUser(user.id)).length > 0;
  if (!reachable) throw notFoundError("That data gap");

  if (!(DATA_GAP_STATUSES as readonly string[]).includes(status)) {
    back(returnTo, { err: "Choose a status from the list." });
  }
  if (status === "CLOSED" && !resolutionNote) {
    back(returnTo, { err: "Say what evidence closed the gap before closing it." });
  }

  await prisma.vesselDataGap.update({
    where: { id },
    data: {
      status,
      resolutionNote,
      closedAt: status === "CLOSED" ? (gap.closedAt ?? new Date()) : null,
      updatedById: user.id,
    },
  });

  await recordAudit({
    actorId: user.id,
    action: "UPDATE",
    resource: "VesselDataGap",
    resourceId: id,
    details: { issue: gap.issue, from: gap.status, to: status, resolutionNote },
  });

  revalidatePath(returnTo);
  back(returnTo, { saved: "gap" });
}
