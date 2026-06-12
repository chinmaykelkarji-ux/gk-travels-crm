import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; path: string }>;
}

// ── sendEmail ─────────────────────────────────────────────────────
// Sends an email via the configured SMTP server. Never throws —
// always resolves with a success/error result.

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  if (!process.env.SMTP_HOST) {
    const error = 'SMTP_HOST not configured';
    console.error(`[Email] Failed to send to ${options.to}: ${error}`);
    return { success: false, error };
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      ...options,
    });
    console.log(`[Email] Sent "${options.subject}" to ${options.to}`);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[Email] Failed to send to ${options.to}:`, error);
    return { success: false, error };
  }
}
