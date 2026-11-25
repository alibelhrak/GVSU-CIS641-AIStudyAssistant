/**
 * Sends email through Brevo's HTTPS API (free: 300 emails a day).
 * Render's free plan blocks normal email (SMTP) ports, but HTTPS works.
 * Without BREVO_API_KEY and MAIL_FROM, the email is printed in the server terminal instead,
 * so "Forgot password" can still be tested on your own computer.
 */
import { config, mailEnabled } from '../config.js';

const BREVO_URL = process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email';

export async function sendMail({ to, toName, subject, text, html }) {
  if (!mailEnabled()) {
    console.log(`\n--- Email (not sent: BREVO_API_KEY / MAIL_FROM not set) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n---\n`);
    return;
  }
  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': config.mail.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: config.mail.fromName, email: config.mail.from },
      to: [{ email: to, ...(toName ? { name: toName } : {}) }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Brevo responded ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
}