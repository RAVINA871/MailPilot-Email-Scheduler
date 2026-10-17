import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config.js";
export interface Mailer { transport: Transporter; from: string }
let cached: Promise<Mailer> | null = null;
// Uses SMTP_* if provided, otherwise asks Ethereal (needs internet) for a throwaway test account.
export function getMailer(): Promise<Mailer> {
  cached ??= (async () => {
    const s = config.smtp;
    if (s.user && s.pass) return { transport: nodemailer.createTransport({ host: s.host, port: s.port, secure: s.port === 465, auth: { user: s.user, pass: s.pass } }), from: s.from || s.user };
    const a = await nodemailer.createTestAccount();
    console.log(`Using Ethereal test account ${a.user} (messages visible via preview URLs)`);
    return { transport: nodemailer.createTransport({ host: a.smtp.host, port: a.smtp.port, secure: a.smtp.secure, auth: { user: a.user, pass: a.pass } }), from: a.user };
  })().catch((e) => { cached = null; throw e; });
  return cached;
}
