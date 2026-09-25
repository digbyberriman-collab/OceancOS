import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  hashResetToken,
  isResetUsable,
  passwordProblemMessage,
  validateNewPassword,
  MIN_PASSWORD_LENGTH,
} from "@/lib/passwordReset";
import { Field, Input } from "@/components/ui/Form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { BrandMark } from "@/components/auth/BrandMark";
import { BrandPanel } from "@/components/auth/BrandPanel";

export const dynamic = "force-dynamic";

async function completeReset(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = validateNewPassword(password, confirm);
  if (problem) redirect(`/reset/${token}?err=${problem}`);

  const reset = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashResetToken(token) },
  });
  if (!isResetUsable(reset)) redirect(`/reset/${token}?err=invalid`);

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({ where: { id: reset!.userId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: reset!.id }, data: { usedAt: new Date() } }),
    // Anyone holding an old session is signed out: if the password was reset
    // because it leaked, the leaked session must go too.
    prisma.session.deleteMany({ where: { userId: reset!.userId } }),
  ]);

  await recordAudit({
    actorId: reset!.userId,
    action: "UPDATE",
    resource: "User",
    resourceId: reset!.userId,
    details: { passwordReset: true, sessionsRevoked: true },
  });

  redirect("/login?reset=1");
}

export default async function ResetPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { err?: string };
}) {
  const reset = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashResetToken(params.token) },
  });
  const usable = isResetUsable(reset);

  const error = searchParams.err;
  const errorMessage =
    error === "invalid"
      ? "That link has expired or has already been used."
      : error === "too-short" || error === "mismatch" || error === "missing"
        ? passwordProblemMessage(error)
        : null;

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />

      <div className="relative flex min-h-screen flex-col justify-center bg-ink-950 px-6 py-12 sm:px-10">
        <div className="pointer-events-none absolute inset-0 bg-radial-glow opacity-70 lg:hidden" />

        <div className="relative mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandMark />
          </div>

          {!usable ? (
            <div className="animate-fade-up">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-bad/10 text-bad ring-1 ring-bad/30">
                <AlertCircle className="h-5 w-5" aria-hidden />
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-white">Link no longer valid</h1>
              <p className="mt-2 text-sm text-muted text-pretty">
                Reset links work once and expire after an hour. Request a new one and it will arrive
                in a moment.
              </p>
              <Link href="/forgot" className="btn-primary btn-lg mt-6 w-full">
                Request a new link
              </Link>
              <Link href="/login" className="btn-ghost mt-4 -ml-3.5">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back to sign in
              </Link>
            </div>
          ) : (
            <div className="animate-fade-up">
              <h1 className="text-xl font-semibold tracking-tight text-white">Set a new password</h1>
              <p className="mt-2 text-sm text-muted text-pretty">
                Choose something at least {MIN_PASSWORD_LENGTH} characters long. A passphrase of a few
                words works well and is easy to type on a phone.
              </p>

              {errorMessage && (
                <div
                  role="alert"
                  className="mt-5 flex items-start gap-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2.5 text-sm text-bad"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form action={completeReset} className="mt-6 space-y-5">
                <input type="hidden" name="token" value={params.token} />
                <Field label="New password">
                  <Input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                  />
                </Field>
                <Field label="Confirm new password">
                  <Input
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                  />
                </Field>
                <SubmitButton className="btn-primary btn-lg w-full" pendingText="Setting password…">
                  Set password
                </SubmitButton>
              </form>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
