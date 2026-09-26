// ============================================================
// WhatsApp through the official Meta WhatsApp Cloud API — the only way
// TravelOS sends WhatsApp (decision in CLAUDE.md). Outside a conversation the
// customer started, WhatsApp only delivers templates Meta has approved, so a
// send always names an approved template; free text is never attempted.
//
//   WHATSAPP_CLOUD_TOKEN       permanent system-user token
//   WHATSAPP_PHONE_NUMBER_ID   the sending number's id in Meta
//   WHATSAPP_API_VERSION       Graph API version (default v21.0)
//   WHATSAPP_APP_SECRET        checks the signature on delivery webhooks
//   WHATSAPP_VERIFY_TOKEN      answers Meta's webhook verification
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizePhone } from '../../../src/shared/calc/phone.js';
import type { ChannelStatus, SendResult, WhatsAppTemplateSend } from './types.js';

export type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; json: () => Promise<unknown> }>;

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_CLOUD_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export function whatsappStatus(): ChannelStatus {
  const configured = whatsappConfigured();
  const legacy = process.env.WHATSAPP_BSP_URL ? ' The classic BSP setting (WHATSAPP_BSP_URL) is not used: TravelOS sends only through the official Meta Cloud API.' : '';
  return {
    channel: 'WHATSAPP', provider: 'Meta WhatsApp Cloud API', configured,
    hint: configured ? (legacy.trim() || null) : `Set WHATSAPP_CLOUD_TOKEN and WHATSAPP_PHONE_NUMBER_ID on the server.${legacy}`,
  };
}

/** wa_id format: country code and number, digits only. Indian 10-digit numbers get 91. */
export function waNumber(phone: string | null | undefined): string | null {
  const n = normalizePhone(phone);
  if (!n) return null;
  return n.length === 10 ? `91${n}` : n;
}

export function templatePayload(m: WhatsAppTemplateSend) {
  return {
    messaging_product: 'whatsapp',
    to: m.to,
    type: 'template',
    template: {
      name: m.template,
      language: { code: m.language },
      ...(m.params.length ? { components: [{ type: 'body', parameters: m.params.map(text => ({ type: 'text', text })) }] } : {}),
    },
  };
}

/** Sends one approved template. Never throws. */
export async function sendWhatsAppTemplate(m: WhatsAppTemplateSend, fetcher: Fetcher = fetch as unknown as Fetcher): Promise<SendResult> {
  if (!whatsappConfigured()) return { ok: false, error: 'WhatsApp is not configured on this server', retryable: false };
  const to = waNumber(m.to);
  if (!to) return { ok: false, error: 'No valid phone number to send to', retryable: false };
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
  try {
    const res = await fetcher(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(templatePayload({ ...m, to })),
    });
    const body = await res.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    if (res.status >= 200 && res.status < 300 && body.messages?.[0]?.id) return { ok: true, providerMessageId: body.messages[0].id };
    const why = body.error?.message ?? `Meta answered ${res.status}`;
    // 429 and 5xx are worth another try; a rejected template or number is not.
    return { ok: false, error: why, retryable: res.status === 429 || res.status >= 500 };
  } catch (err) {
    return { ok: false, error: `Could not reach Meta: ${err instanceof Error ? err.message : String(err)}`, retryable: true };
  }
}

/** Meta signs each webhook with the app secret; anything unsigned or mis-signed is refused. */
export function validWebhookSignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !rawBody || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}
