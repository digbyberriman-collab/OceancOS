"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { THEME_COOKIE, parseTheme, safeReturnPath } from "@/lib/theme";
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

/**
 * Remember the theme for this browser.
 *
 * Ends in a redirect rather than a revalidation: without JavaScript, a plain
 * form post renders with the cookies it arrived with, so the page would come
 * back in the old theme.
 */
export async function setThemeAction(formData: FormData) {
  const theme = parseTheme(formData.get("theme"));
  cookies().set(THEME_COOKIE, theme, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  redirect(safeReturnPath(formData.get("returnTo")));
}
