import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import {
  generateResetToken,
  hashResetToken,
  resetEmailBody,
  resetTokenExpiry,
} from "@/lib/passwordReset";
import { Field, Input } from "@/components/ui/Form";
import { BrandMark } from "@/components/auth/BrandMark";
import { BrandPanel } from "@/components/auth/BrandPanel";

export const dynamic = "force-dynamic";

const EmailSchema = z.object({ email: z.string().email() });

async function requestReset(formData: FormData) {
  "use server";

  const parsed = EmailSchema.safeParse({ email: formData.get("email") });

  // Always land on the same confirmation. Telling an anonymous visitor whether
  // an address is registered would leak the crew list.
  if (parsed.success) {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

    if (user && user.active) {
      // Supersede any outstanding request so only the newest link works.
      await prisma.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      const token = generateResetToken();
      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: hashResetToken(token),
          expiresAt: resetTokenExpiry(),
        },
      });

      const base = process.env.APP_URL || "http://localhost:3000";
      const { subject, text } = resetEmailBody({
        name: user.name,
        url: `${base.replace(/\/$/, "")}/reset/${token}`,
      });
      await sendEmail({ to: user.email, subject, text });

      await recordAudit({
        actorId: user.id,
        action: "UPDATE",
        resource: "PasswordReset",
        resourceId: user.id,
        details: { requested: true },
      });
    }
  }

  redirect("/forgot?sent=1");
}

export default function ForgotPage({ searchParams }: { searchParams: { sent?: string } }) {
  const sent = Boolean(searchParams.sent);

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />

      <div className="relative flex min-h-screen flex-col justify-center bg-ink-950 px-6 py-12 sm:px-10">
        <div className="pointer-events-none absolute inset-0 bg-radial-glow opacity-70 lg:hidden" />

        <div className="relative mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandMark />
          </div>

          {sent ? (
            <div className="animate-fade-up">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-ok/10 text-ok ring-1 ring-ok/30">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-white">Check your email</h1>
              <p className="mt-2 text-sm text-muted text-pretty">
                If that address belongs to an OceancOS account, a reset link is on its way. The link
                works once and expires in an hour.
              </p>
              <Link href="/login" className="btn-ghost mt-6 -ml-3.5">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back to sign in
              </Link>
            </div>
          ) : (
            <div className="animate-fade-up">
              <h1 className="text-xl font-semibold tracking-tight text-white">Forgot password</h1>
              <p className="mt-2 text-sm text-muted text-pretty">
                Enter the email address you use for OceancOS and we will send you a link to set a new
                password.
              </p>

              <form action={requestReset} className="mt-6 space-y-5">
                <Field label="Email">
                  <Input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                  />
                </Field>
                <button className="btn-primary btn-lg w-full">Send reset link</button>
              </form>

              <Link href="/login" className="btn-ghost mt-4 -ml-3.5">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
