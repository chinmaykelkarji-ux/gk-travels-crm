// ============================================================
// Outbound channels — how a message actually leaves TravelOS.
//
// Two channels, each behind a small adapter that never throws: it answers
// sent (with the provider's message id), or failed (with a reason in plain
// words and whether trying again could help). An adapter that is not
// configured says so and sends nothing (hard rule 9).
// ============================================================

export type ChannelName = 'WHATSAPP' | 'EMAIL';

export interface WhatsAppTemplateSend {
  to: string;
  /** The template name Meta approved, and its language. */
  template: string;
  language: string;
  /** Body parameters, in the order the template uses them. */
  params: string[];
}

export interface EmailSend { to: string; subject: string; text: string }

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string; retryable: boolean };

export interface ChannelStatus {
  channel: ChannelName;
  provider: string;
  configured: boolean;
  /** What to set, in plain words — never a key or any part of one. */
  hint: string | null;
}
