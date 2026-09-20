"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { storeActiveProject } from "@/lib/project";

export async function logoutAction() {
  const u = await getCurrentUser();
  if (u) await recordAudit({ actorId: u.id, action: "LOGOUT", resource: "User", resourceId: u.id });
  await destroySession();
  redirect("/login");
}

export async function setActiveProjectAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return;
  await storeActiveProject(user.id, projectId);
  await recordAudit({
    actorId: user.id,
    action: "UPDATE",
    resource: "Session",
    resourceId: user.id,
    details: { activeProjectId: projectId },
  });
  revalidatePath("/", "layout");
}
