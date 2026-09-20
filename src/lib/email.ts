// Outbound email.
//
// Two transports:
//
//   smtp    — used when SMTP_HOST is set. Real delivery via nodemailer.
//   outbox  — the default. Writes each message as JSON under ./.mail and logs
//             a line, so development, CI and the end-to-end tests exercise the
//             same code path as production without a mail server.
//
// Every send is best-effort: a mail failure must never roll back the action
// that triggered it. Callers that need to know check the returned `delivered`.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendResult = {
  delivered: boolean;
  transport: "smtp" | "outbox";
  error?: string;
};

export function emailTransportName(): "smtp" | "outbox" {
  return process.env.SMTP_HOST ? "smtp" : "outbox";
}

export function outboxDir(): string {
  return resolve(process.env.MAIL_OUTBOX_DIR || "./.mail");
}

function fromAddress(): string {
  return process.env.SMTP_FROM || "OceancOS <noreply@oceancos.local>";
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const transport = emailTransportName();

  try {
    if (transport === "outbox") {
      const dir = outboxDir();
      await mkdir(dir, { recursive: true });
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
      await writeFile(
        resolve(dir, name),
        JSON.stringify({ ...message, from: fromAddress(), sentAt: new Date().toISOString() }, null, 2)
      );
      // eslint-disable-next-line no-console
      console.log(`[email:outbox] ${message.subject} → ${message.to} (${name})`);
      return { delivered: true, transport };
    }

    const nodemailer = await import("nodemailer");
    const port = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });

    await transporter.sendMail({
      from: fromAddress(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { delivered: true, transport };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown mail error";
    // eslint-disable-next-line no-console
    console.error(`[email] failed to send "${message.subject}" to ${message.to}: ${error}`);
    return { delivered: false, transport, error };
  }
}

/**
 * Fan-out used by `notify()`. In-app notifications remain the source of truth,
 * so this never throws.
 */
export async function sendEmailBatch(opts: {
  userIds: string[];
  title: string;
  body?: string;
  resource?: string;
  resourceId?: string;
}): Promise<void> {
  if (!opts.userIds.length) return;

  // Imported here to keep this module usable from scripts without a database.
  const { prisma } = await import("./db");
  const users = await prisma.user.findMany({
    where: { id: { in: opts.userIds }, active: true },
    select: { email: true, name: true },
  });

  await Promise.all(
    users.map((user) =>
      sendEmail({
        to: user.email,
        subject: opts.title,
        text: [`Hello ${user.name},`, "", opts.body ?? opts.title, "", "— OceancOS"].join("\n"),
      })
    )
  );
}
