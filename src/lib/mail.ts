import nodemailer from "nodemailer";

/** Sends an email via SMTP. Without SMTP settings (local dev) the message is printed to the console. */
export async function sendMail(to: string, subject: string, text: string, html?: string) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.info(`\n[mail] SMTP not configured — would send to ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
}
