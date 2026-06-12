import axios from 'axios';

export interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function logAttempt(to: string, label: string, result: WhatsAppResult) {
  console.log(
    `[WhatsApp] ${new Date().toISOString()} → to=${to} template=${label} ` +
    `result=${result.success ? 'SUCCESS' : 'FAILED'}` +
    (result.error ? ` error=${result.error}` : ''),
  );
}

// ── sendWhatsAppTemplate ──────────────────────────────────────────
// Sends a pre-approved WhatsApp template message via the configured
// BSP (Gupshup / AiSensy / Interakt). Never throws — always resolves
// with a success/error result so callers (and the outbox worker) can
// fall back to plain text.

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  params: string[],
): Promise<WhatsAppResult> {
  if (!process.env.WHATSAPP_BSP_URL) {
    const result = { success: false, error: 'WHATSAPP_BSP_URL not configured' };
    logAttempt(to, templateName, result);
    return result;
  }

  try {
    const response = await axios.post(
      process.env.WHATSAPP_BSP_URL,
      {
        channel:     'whatsapp',
        source:      process.env.WHATSAPP_FROM_NUMBER,
        destination: to,
        template:    { id: templateName, params },
      },
      {
        headers: {
          apikey:         process.env.WHATSAPP_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      },
    );
    const result = { success: true, messageId: response.data?.messageId };
    logAttempt(to, templateName, result);
    return result;
  } catch (err) {
    const result = { success: false, error: err instanceof Error ? err.message : String(err) };
    logAttempt(to, templateName, result);
    return result;
  }
}

// ── sendWhatsAppText ──────────────────────────────────────────────
// Sends a free-form text message — used for fallback messages when a
// template is not yet approved, and for internal operations alerts.

export async function sendWhatsAppText(to: string, message: string): Promise<WhatsAppResult> {
  if (!process.env.WHATSAPP_BSP_URL) {
    const result = { success: false, error: 'WHATSAPP_BSP_URL not configured' };
    logAttempt(to, 'text', result);
    return result;
  }

  try {
    const response = await axios.post(
      process.env.WHATSAPP_BSP_URL,
      {
        channel:     'whatsapp',
        source:      process.env.WHATSAPP_FROM_NUMBER,
        destination: to,
        message:     { type: 'text', text: message },
      },
      {
        headers: {
          apikey:         process.env.WHATSAPP_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      },
    );
    const result = { success: true, messageId: response.data?.messageId };
    logAttempt(to, 'text', result);
    return result;
  } catch (err) {
    const result = { success: false, error: err instanceof Error ? err.message : String(err) };
    logAttempt(to, 'text', result);
    return result;
  }
}
