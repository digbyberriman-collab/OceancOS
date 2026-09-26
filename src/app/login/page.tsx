import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { getCurrentUser, createSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LoginSchema } from "@/lib/validators";
import { recordAudit } from "@/lib/audit";
import { Field, Input } from "@/components/ui/Form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { BrandMark } from "@/components/auth/BrandMark";
import { BrandPanel } from "@/components/auth/BrandPanel";
import { readFormFlash, setFormFlash } from "@/lib/formFlash";
import { FlashCleanup } from "@/components/ui/FlashCleanup";

type LoginFlash = { error: string; email: string };

/**
 * Three distinct failure messages, not one "invalid" — the [VALIDATION-MESSAGES]
 * finding this closes: a malformed address is not a credential signal and
 * reads badly reported as one; an inactive account leaves a former crew
 * member no way to understand why they can't get in. Not distinguishing
 * wrong-password from unknown-user stays deliberate (a security property,
 * not an oversight) — both still land on "credentials".
 */
async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const back = (error: string): never => {
    setFormFlash("login", { error, email } satisfies LoginFlash);
    redirect("/login");
  };

  const parsed = LoginSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) back("That doesn't look like a valid email address.");
  const user = await prisma.user.findUnique({ where: { email: parsed.data!.email } });
  if (!user || !user.active) back("Invalid email or password. Please check your details and try again.");
  const ok = await verifyPassword(parsed.data!.password, user!.passwordHash);
  if (!ok) back("Invalid email or password. Please check your details and try again.");
  await createSession(user!.id);
  await recordAudit({ actorId: user!.id, action: "LOGIN", resource: "User", resourceId: user!.id });
  redirect("/dashboard");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { reset?: string };
}) {
  if (await getCurrentUser()) redirect("/dashboard");
  const flash = readFormFlash<LoginFlash>("login");
  const hasError = Boolean(flash?.error);
  const justReset = Boolean(searchParams.reset);

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      {flash && <FlashCleanup name="login" />}
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
            {justReset && !hasError && (
              <div
                role="status"
                className="mb-5 flex items-start gap-2.5 rounded-lg border border-ok/30 bg-ok/10 px-3.5 py-3 text-sm text-ok animate-fade-in"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Password updated. Sign in with your new password.</span>
              </div>
            )}

            {hasError && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-5 flex items-start gap-2.5 rounded-lg border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-bad animate-fade-in"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{flash?.error}</span>
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
                  defaultValue={flash?.email ?? ""}
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
              <div className="-mt-2 text-right">
                <Link
                  href="/forgot"
                  className="text-xs text-muted underline-offset-2 transition-colors hover:text-white hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <SubmitButton className="btn-primary btn-lg w-full" pendingText="Signing in…">
                Sign in
              </SubmitButton>
            </form>
          </div>

          <p className="mt-8 text-center text-xs text-faint">
            © {new Date().getFullYear()} OceancOS · Secure, audited access
          </p>
        </div>
      </div>
    </main>
  );
}
