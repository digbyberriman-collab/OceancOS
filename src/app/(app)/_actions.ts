"use server";
import { redirect } from "next/navigation";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function logoutAction() {
  const u = await getCurrentUser();
  if (u) await recordAudit({ actorId: u.id, action: "LOGOUT", resource: "User", resourceId: u.id });
  await destroySession();
  redirect("/login");
}
