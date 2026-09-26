// ============================================================
// The channels, and what the settings screen says about them.
//
// Tests never reach Meta or a mail server: with NODE_ENV=test and
// COMMS_TRANSPORT=memory every send is captured in memory instead, and the
// status says so. Outside tests that transport cannot be switched on.
// ============================================================

import { emailStatus, sendEmailMessage } from './email.js';
import { sendWhatsAppTemplate, whatsappStatus } from './whatsappCloud.js';
import type { ChannelStatus, EmailSend, SendResult, WhatsAppTemplateSend } from './types.js';

export * from './types.js';
export { waNumber, validWebhookSignature } from './whatsappCloud.js';

export interface Captured { channel: 'WHATSAPP' | 'EMAIL'; message: WhatsAppTemplateSend | EmailSend; at: Date }
export const captured: Captured[] = [];
/** Tests set this to make the next captured send fail. */
export const captureControl = { failNext: null as null | { error: string; retryable: boolean } };

function memory(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.COMMS_TRANSPORT === 'memory';
}

function capture(channel: Captured['channel'], message: Captured['message']): SendResult {
  if (captureControl.failNext) { const f = captureControl.failNext; captureControl.failNext = null; return { ok: false, ...f }; }
  captured.push({ channel, message, at: new Date() });
  return { ok: true, providerMessageId: `mem-${captured.length}` };
}

export function channelStatus(): { whatsapp: ChannelStatus; email: ChannelStatus; webhook: { configured: boolean; hint: string | null } } {
  if (memory()) {
    const test = (channel: 'WHATSAPP' | 'EMAIL'): ChannelStatus => ({ channel, provider: 'test capture — nothing leaves the server', configured: true, hint: null });
    return { whatsapp: test('WHATSAPP'), email: test('EMAIL'), webhook: { configured: true, hint: null } };
  }
  const webhook = Boolean(process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN);
  return {
    whatsapp: whatsappStatus(), email: emailStatus(),
    webhook: { configured: webhook, hint: webhook ? null : 'Set WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN, then point Meta at /api/webhooks/whatsapp to see delivered and read ticks.' },
  };
}

export function channelConfigured(channel: 'WHATSAPP' | 'EMAIL'): boolean {
  const s = channelStatus();
  return channel === 'WHATSAPP' ? s.whatsapp.configured : s.email.configured;
}

export async function sendWhatsApp(m: WhatsAppTemplateSend): Promise<SendResult> {
  return memory() ? capture('WHATSAPP', m) : sendWhatsAppTemplate(m);
}

export async function sendEmail(m: EmailSend): Promise<SendResult> {
  return memory() ? capture('EMAIL', m) : sendEmailMessage(m);
}
