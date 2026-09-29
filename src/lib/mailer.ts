// src/lib/mailer.ts
// One place that talks SMTP. Built from the mailer that already lived inside
// /api/auth/forgot-password/send-otp, so the staff reset, the customer reset and
// the super-admin sign-in code all send the same way and share one .env block.
//
// Nothing is sent when SMTP_HOST is empty — the caller decides what to say.

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super("SMTP_HOST is empty in .env, so no e-mail was sent.");
    this.name = "MailNotConfiguredError";
  }
}

export function mailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(String(env.SMTP_HOST ?? "").trim());
}

export const MAIL_ENV_KEYS = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] as const;

export function mailMissingEnv(env: Record<string, string | undefined> = process.env): string[] {
  return MAIL_ENV_KEYS.filter((key) => !String(env[key] ?? "").trim());
}

export async function sendMail({ to, subject, html, text }: MailInput): Promise<void> {
  if (!mailConfigured()) throw new MailNotConfiguredError();

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? '"SAYO Beauty" <no-reply@sayobeauty.com>',
    to,
    subject,
    text,
    html,
  });
}

/** The box every one of our codes is shown in. */
export function codeMailHtml(title: string, intro: string, code: string, footer: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#B8860B">${title}</h2>
      <p>${intro}</p>
      <div style="font-size:2.5rem;font-weight:700;letter-spacing:0.4em;
                  color:#B8860B;text-align:center;padding:1.5rem 0">${code}</div>
      <p style="color:#666;font-size:0.85rem">${footer}</p>
    </div>
  `;
}
