// Stub: real implementation can use nodemailer. Kept dynamic so it's not required.
export async function sendEmailBatch(_opts: unknown) {
  if (!process.env.SMTP_HOST) return;
  // intentionally not implemented in this scaffold; replace with nodemailer.createTransport(...)
}
