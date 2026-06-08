import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { getCurrentUser, createSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LoginSchema } from "@/lib/validators";
import { recordAudit } from "@/lib/audit";
import { Field, Input } from "@/components/ui/Form";
import { BrandMark } from "@/components/auth/BrandMark";
import { BrandPanel } from "@/components/auth/BrandPanel";
import { DemoHint } from "@/components/auth/DemoHint";

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
  const hasError = Boolean(searchParams.err);

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      {/* Brand / marketing panel (desktop only) */}
      <BrandPanel />

      {/* Sign-in column */}
      <div className="relative flex min-h-screen flex-col justify-center bg-ink-950 px-6 py-12 sm:px-10">
        {/* Subtle ambience on small screens where the brand panel is hidden */}
        <div className="pointer-events-none absolute inset-0 bg-radial-glow opacity-70 lg:hidden" />

        <div className="relative z-10 mx-auto w-full max-w-sm animate-fade-up">
          {/* Compact brand lockup — primary on mobile, reassurance on desktop */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark className="h-10 w-10" />
            <span className="text-base font-semibold tracking-tight text-white">OceancOS</span>
          </div>

          <div className="mb-7">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Sign in</h1>
            <p className="mt-1.5 text-sm text-muted">
              Welcome back. Enter your details to access your project.
            </p>
          </div>

          <div className="surface p-6 shadow-raised sm:p-7">
            {hasError && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-5 flex items-start gap-2.5 rounded-lg border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-bad animate-fade-in"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Invalid email or password. Please check your details and try again.
                </span>
              </div>
            )}

            <form action={login} className="space-y-5">
              <Field label="Email">
                <Input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  placeholder="you@example.com"
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password..."
                />
              </Field>
              <button type="submit" className="btn-primary btn-lg w-full">
                Sign in
              </button>
            </form>
          </div>

          <div className="mt-5">
            <DemoHint />
          </div>

          <p className="mt-8 text-center text-xs text-faint">
            © {new Date().getFullYear()} OceancOS · Secure, audited access
          </p>
        </div>
      </div>
    </main>
  );
}
