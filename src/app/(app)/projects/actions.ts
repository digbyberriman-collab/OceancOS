"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { storeActiveProject } from "@/lib/project";

/**
 * Make a project the one being worked in and go to its dashboard — the way
 * into a historical yard period, which the header switcher does not list.
 */
export async function openProjectAction(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) redirect("/projects");
  // Refuses a project the user cannot reach.
  await storeActiveProject(user.id, projectId);
  await recordAudit({
    actorId: user.id,
    action: "UPDATE",
    resource: "Session",
    resourceId: user.id,
    details: { activeProjectId: projectId },
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
