import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Root() {
  const u = await getCurrentUser();
  redirect(u ? "/dashboard" : "/login");
}
