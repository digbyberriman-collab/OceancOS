import { redirect } from "next/navigation";
import { getCurrentUser, createSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LoginSchema } from "@/lib/validators";
import { recordAudit } from "@/lib/audit";
import { Field, Input } from "@/components/ui/Form";

async function login(formData: FormData) {
  "use server";
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/login?err=invalid");
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.active) redirect("/login?err=invalid");
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) redirect("/login?err=invalid");
  await createSession(user.id);
  await recordAudit({ actorId: user.id, action: "LOGIN", resource: "User", resourceId: user.id });
  redirect("/dashboard");
}

export default async function LoginPage({ searchParams }: { searchParams: { err?: string } }) {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <div className="min-h-screen grid place-items-center bg-ink-950 p-6">
      <div className="w-full max-w-sm surface p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-accent grid place-items-center text-white font-semibold">O</div>
          <div>
            <h1 className="text-lg font-semibold">OceancOS</h1>
            <p className="text-xs text-muted">Sign in to your project</p>
          </div>
        </div>
        <form action={login} className="space-y-4">
          <Field label="Email">
            <Input type="email" name="email" required autoComplete="email" />
          </Field>
          <Field label="Password">
            <Input type="password" name="password" required autoComplete="current-password" />
          </Field>
          {searchParams.err && (
            <div className="text-xs text-bad">Invalid email or password.</div>
          )}
          <button className="btn-primary w-full">Sign in</button>
        </form>
      </div>
    </div>
  );
}
