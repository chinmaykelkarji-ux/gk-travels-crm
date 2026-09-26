// The channels: WhatsApp only through Meta's Cloud API with an approved
// template, honest "not configured", and signed webhooks only.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { sendWhatsAppTemplate, templatePayload, validWebhookSignature, waNumber, whatsappStatus, type Fetcher } from '../../server/src/comms/whatsappCloud';
import { emailStatus, sendEmailMessage } from '../../server/src/comms/email';

const KEYS = ['WHATSAPP_CLOUD_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_BSP_URL', 'SMTP_HOST', 'EMAIL_FROM'] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => { saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]])); for (const k of KEYS) delete process.env[k]; });
afterEach(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

const fake = (status: number, body: unknown, calls: { url: string; body: unknown; auth: string }[] = []): Fetcher => async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
  return { status, json: async () => body };
};
const msg = { to: '98765 43210', template: 'payment_reminder_v1', language: 'en', params: ['Ramesh Patil', '₹45,000'] };

describe('WhatsApp (Meta Cloud API)', () => {
  it('says "not configured" and sends nothing without a token and a number id', async () => {
    expect(whatsappStatus()).toMatchObject({ configured: false, hint: expect.stringContaining('WHATSAPP_CLOUD_TOKEN') });
    const calls: never[] = [];
    expect(await sendWhatsAppTemplate(msg, fake(200, {}, calls))).toEqual({ ok: false, error: 'WhatsApp is not configured on this server', retryable: false });
    expect(calls).toHaveLength(0);
  });

  it('never uses the classic BSP setting, and says so', () => {
    process.env.WHATSAPP_BSP_URL = 'https://bsp.example';
    expect(whatsappStatus()).toMatchObject({ configured: false, hint: expect.stringContaining('only through the official Meta Cloud API') });
  });

  it('sends an approved template with its parameters in order, to the number with its country code', async () => {
    process.env.WHATSAPP_CLOUD_TOKEN = 'test-token'; process.env.WHATSAPP_PHONE_NUMBER_ID = '1234';
    const calls: { url: string; body: unknown; auth: string }[] = [];
    const r = await sendWhatsAppTemplate(msg, fake(200, { messages: [{ id: 'wamid.ABC' }] }, calls));
    expect(r).toEqual({ ok: true, providerMessageId: 'wamid.ABC' });
    expect(calls[0].url).toBe('https://graph.facebook.com/v21.0/1234/messages');
    expect(calls[0].auth).toBe('Bearer test-token');
    expect(calls[0].body).toEqual({
      messaging_product: 'whatsapp', to: '919876543210', type: 'template',
      template: { name: 'payment_reminder_v1', language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ramesh Patil' }, { type: 'text', text: '₹45,000' }] }] },
    });
    expect(templatePayload({ ...msg, params: [] }).template).not.toHaveProperty('components');
  });

  it('a rejected template is not retried; rate limits, outages and network errors are', async () => {
    process.env.WHATSAPP_CLOUD_TOKEN = 't'; process.env.WHATSAPP_PHONE_NUMBER_ID = '1';
    expect(await sendWhatsAppTemplate(msg, fake(400, { error: { message: 'Template name does not exist' } }))).toEqual({ ok: false, error: 'Template name does not exist', retryable: false });
    expect(await sendWhatsAppTemplate(msg, fake(429, {}))).toMatchObject({ ok: false, retryable: true });
    expect(await sendWhatsAppTemplate(msg, fake(503, {}))).toMatchObject({ ok: false, retryable: true });
    expect(await sendWhatsAppTemplate(msg, async () => { throw new Error('ECONNRESET'); })).toMatchObject({ ok: false, retryable: true, error: expect.stringContaining('ECONNRESET') });
    expect(await sendWhatsAppTemplate({ ...msg, to: '12' }, fake(200, {}))).toMatchObject({ ok: false, error: 'No valid phone number to send to' });
  });

  it('formats numbers the way Meta wants them', () => {
    expect(waNumber('+91 98765 43210')).toBe('919876543210');
    expect(waNumber('098765 43210')).toBe('919876543210');
    expect(waNumber('')).toBeNull();
  });

  it('accepts a webhook only with a valid signature', () => {
    process.env.WHATSAPP_APP_SECRET = 'app-secret';
    const body = Buffer.from('{"entry":[]}');
    const sig = `sha256=${createHmac('sha256', 'app-secret').update(body).digest('hex')}`;
    expect(validWebhookSignature(body, sig)).toBe(true);
    expect(validWebhookSignature(Buffer.from('{"entry":[1]}'), sig)).toBe(false);
    expect(validWebhookSignature(body, 'sha256=00')).toBe(false);
    expect(validWebhookSignature(body, undefined)).toBe(false);
    delete process.env.WHATSAPP_APP_SECRET;
    expect(validWebhookSignature(body, sig)).toBe(false);
  });
});

describe('email (SMTP)', () => {
  it('says "not configured" and sends nothing without a host and a from address', async () => {
    expect(emailStatus()).toMatchObject({ configured: false, hint: expect.stringContaining('SMTP_HOST') });
    expect(await sendEmailMessage({ to: 'a@b.in', subject: 's', text: 't' })).toMatchObject({ ok: false, retryable: false });
  });
  it('refuses an address that is not one', async () => {
    process.env.SMTP_HOST = 'smtp.example'; process.env.EMAIL_FROM = 'office@gk.example';
    expect(await sendEmailMessage({ to: 'not-an-email', subject: 's', text: 't' })).toMatchObject({ ok: false, error: 'No valid email address to send to' });
  });
});
