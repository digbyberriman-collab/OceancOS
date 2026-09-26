"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertPermission, PERMISSIONS } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import {
  normaliseProjectCode,
  parseDateField,
  validateYardPeriod,
} from "@/lib/projectDates";
import { PROJECT_TYPES } from "@/lib/enums";

/**
 * Update a project's name, type, code and yard period.
 *
 * These dates drive the Home timing cards and the time-progress ring, so an
 * out-of-order period is rejected rather than stored: it would make the
 * project's headline figures wrong rather than merely look odd.
 */
export async function updateProjectAction(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.PROJ_EDIT);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) redirect("/admin/projects?err=missing");

  const dates = {
    arrivalDate: parseDateField(formData.get("arrivalDate")),
    haulOutDate: parseDateField(formData.get("haulOutDate")),
    seaTrialsDate: parseDateField(formData.get("seaTrialsDate")),
    departureDate: parseDateField(formData.get("departureDate")),
  };

  const problems = validateYardPeriod(dates);
  if (problems.length) {
    redirect(`/admin/projects?id=${id}&err=${encodeURIComponent(problems[0].message)}`);
  }

  const code = normaliseProjectCode(String(formData.get("code") ?? ""));

  // The code is unique, so a clash must be reported rather than thrown.
  if (code && code !== existing.code) {
    const clash = await prisma.project.findUnique({ where: { code } });
    if (clash) {
      redirect(
        `/admin/projects?id=${id}&err=${encodeURIComponent(`Code ${code} is already used by another project.`)}`
      );
    }
  }

  // Name and type are optional in the submission so older forms keep working.
  const nameInput = formData.get("name");
  const name = nameInput == null ? existing.name : String(nameInput).trim();
  if (!name) redirect(`/admin/projects?id=${id}&err=${encodeURIComponent("A project needs a name.")}`);
  const type = String(formData.get("type") ?? existing.type);
  if (!(PROJECT_TYPES as readonly string[]).includes(type)) {
    redirect(`/admin/projects?id=${id}&err=${encodeURIComponent("Choose a project type from the list.")}`);
  }

  const yardName = String(formData.get("yardName") ?? "").trim() || null;
  const currency = String(formData.get("currency") ?? "EUR").trim().toUpperCase() || "EUR";

  await prisma.project.update({
    where: { id },
    data: { ...dates, name, type, code, yardName, currency },
  });

  await recordAudit({
    actorId: user.id,
    action: "UPDATE",
    resource: "Project",
    resourceId: id,
    details: {
      name,
      type,
      code,
      yardName,
      currency,
      arrivalDate: dates.arrivalDate?.toISOString() ?? null,
      departureDate: dates.departureDate?.toISOString() ?? null,
    },
  });

  // The header switcher and every yard figure read these.
  revalidatePath("/", "layout");
  redirect(`/admin/projects?id=${id}&saved=1`);
}
