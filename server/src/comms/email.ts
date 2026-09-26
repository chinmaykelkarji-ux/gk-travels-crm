// ============================================================
// Email over SMTP. Plain text, from the agency's own address.
//
//   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / EMAIL_FROM
// ============================================================

import nodemailer, { type Transporter } from 'nodemailer';
import type { ChannelStatus, EmailSend, SendResult } from './types.js';

let transporter: Transporter | null = null;

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM);
}

export function emailStatus(): ChannelStatus {
  const configured = emailConfigured();
  return { channel: 'EMAIL', provider: 'SMTP', configured, hint: configured ? null : 'Set SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM on the server.' };
}

/** Sends one email. Never throws. */
export async function sendEmailMessage(m: EmailSend): Promise<SendResult> {
  if (!emailConfigured()) return { ok: false, error: 'Email is not configured on this server', retryable: false };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.to)) return { ok: false, error: 'No valid email address to send to', retryable: false };
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  try {
    const info = await transporter.sendMail({ from: process.env.EMAIL_FROM, to: m.to, subject: m.subject, text: m.text });
    return { ok: true, providerMessageId: info.messageId ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), retryable: true };
  }
}
