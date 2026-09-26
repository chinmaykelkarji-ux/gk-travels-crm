// ============================================================
// Communications — preview, send, log.
//
//   preview   the template filled from the real records; lists anything
//             missing and says whether TravelOS can send it itself
//   send      refuses a gap, an unconfigured channel, or a WhatsApp template
//             Meta has not approved; otherwise logs it QUEUED and hands it
//             to the job runner (`comms.send`) — the request never waits on
//             Meta or a mail server
//   deliver   the job: one attempt; a retryable failure tries again (at most
//             three), anything else is FAILED with the reason
//   opened    a person opened the message in their own WhatsApp / mail
//   log       one list per trip or customer, including the classic
//             message_logs rows
//
// Nothing here sends without a person's act or an automation rule the owner
// switched on (7.4).
// ============================================================

import type { Communication, Prisma } from '@prisma/client';
import { prisma, prismaUnscoped } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { enqueueJob } from '../../core/jobs.js';
import { AppError, notConfigured, notFound } from '../../core/errors.js';
import { renderTemplate, type TemplateChannel } from '../../../../src/shared/calc/templates.js';
import { mailtoLink, whatsappLink } from '../../../../src/shared/calc/messageLinks.js';
import { COMM_STATUS_LABEL, type CommLogQuery, type CommOpened, type CommPreview, type CommSend, type CommStatus, type CommView } from '../../../../src/shared/contracts/comms.js';
import { channelConfigured, channelStatus, sendEmail, sendWhatsApp } from '../../comms/index.js';
import { activeTemplate } from '../templates/service.js';
import { templateValues } from './values.js';

export const MAX_SEND_ATTEMPTS = 3;
const ORDER: Record<string, number> = { QUEUED: 0, SENDING: 1, SENT: 2, DELIVERED: 3, READ: 4 };

async function prepare(input: CommSend) {
  const template = await activeTemplate(input.templateKey, input.channel as TemplateChannel);
  if (!template) throw notFound(`An active ${input.channel === 'WHATSAPP' ? 'WhatsApp' : 'email'} template "${input.templateKey}"`);
  const { values, to } = await templateValues(input);
  const r = renderTemplate(template, values);
  const recipient = input.to ?? (input.channel === 'WHATSAPP' ? to.phone : to.email);
  const status = channelStatus();
  let cannotSend: string | null = null;
  if (!(input.channel === 'WHATSAPP' ? status.whatsapp : status.email).configured) cannotSend = `${input.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'} is not configured on this server`;
  else if (input.channel === 'WHATSAPP' && !template.metaTemplateName) cannotSend = 'This template has no Meta-approved template name yet, so WhatsApp will not deliver it';
  else if (!recipient) cannotSend = input.channel === 'WHATSAPP' ? 'No phone number on file' : 'No email address on file';
  const openLink = r.missing.length || !recipient ? null
    : input.channel === 'WHATSAPP' ? whatsappLink(recipient, r.text) : mailtoLink(recipient, r.subject, r.text);
  const preview: CommPreview = {
    channel: input.channel, templateKey: template.key, templateName: template.name, to: recipient, subject: r.subject, text: r.text,
    missing: r.missing, cannotSend, openLink,
  };
  return { template, rendered: r, recipient, preview, customerId: input.customerId ?? null };
}

export async function previewMessage(input: CommSend): Promise<CommPreview> {
  return (await prepare(input)).preview;
}

/** Queues a message for TravelOS to send. Refuses rather than sending anything incomplete. */
export async function sendMessage(input: CommSend, actorId: string | null, source: 'HUMAN' | 'AUTOMATION' = 'HUMAN', automationRunId: string | null = null) {
  if (!channelConfigured(input.channel)) throw notConfigured(input.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email');
  const { template, rendered, recipient, preview } = await prepare(input);
  if (rendered.missing.length) {
    throw new AppError('VALIDATION_ERROR', 400, `Cannot send: TravelOS does not have ${rendered.missing.map(m => `{{${m}}}`).join(', ')} for this message`, { missing: rendered.missing.join(',') });
  }
  if (preview.cannotSend) throw new AppError('STATE_CONFLICT', 409, preview.cannotSend);
  const trip = input.tripId ? await prisma.trip.findUnique({ where: { id: input.tripId }, select: { customerId: true } }) : null;
  const customerId = input.customerId ?? trip?.customerId ?? null;
  const row = await prisma.$transaction(async tx => {
    const c = await tx.communication.create({
      data: {
        type: input.channel.toLowerCase(), channel: input.channel, via: 'TRAVELOS', status: 'QUEUED', source,
        recipient: recipient!, subject: rendered.subject, body: rendered.text, params: rendered.params, templateKey: template.key,
        entityType: input.tripId ? 'trip' : 'customer', entityId: (input.tripId ?? customerId)!, tripId: input.tripId, customerId,
        userId: actorId, automationRunId,
      },
    });
    await audit(tx, {
      action: 'message_queued', entityType: c.entityType, entityId: c.entityId, userId: actorId, source: source === 'AUTOMATION' ? 'SYSTEM' : 'HUMAN',
      description: `${template.name} (${input.channel === 'WHATSAPP' ? 'WhatsApp' : 'email'}) to ${recipient} queued`, metadata: { communicationId: c.id },
    });
    return c;
  });
  await enqueueJob({ type: 'comms.send', payload: { communicationId: row.id }, idempotencyKey: `comms:${row.id}`, maxAttempts: MAX_SEND_ATTEMPTS + 1, priority: 6 });
  return commView(row, null);
}

/** One delivery attempt, run by the job runner. Throws only to ask for a retry. */
export async function deliver(communicationId: string): Promise<{ status: string }> {
  const c = await prisma.communication.findUnique({ where: { id: communicationId } });
  if (!c || c.status !== 'QUEUED') return { status: c?.status ?? 'missing' };
  await prisma.communication.update({ where: { id: c.id }, data: { status: 'SENDING', attempts: { increment: 1 } } });
  const attempt = c.attempts + 1;
  const template = c.templateKey && c.channel === 'WHATSAPP' ? await prisma.messageTemplate.findFirst({ where: { key: c.templateKey, channel: 'WHATSAPP' } }) : null;
  const result = c.channel === 'WHATSAPP'
    ? (template?.metaTemplateName
      ? await sendWhatsApp({ to: c.recipient, template: template.metaTemplateName, language: template.metaLanguage, params: (c.params as string[] | null) ?? [] })
      : { ok: false as const, error: 'The template lost its Meta-approved name before sending', retryable: false })
    : await sendEmail({ to: c.recipient, subject: c.subject ?? '', text: c.body ?? '' });

  if (result.ok) {
    await prisma.communication.update({ where: { id: c.id }, data: { status: 'SENT', sentAt: new Date(), providerMessageId: result.providerMessageId, statusReason: null } });
    return { status: 'SENT' };
  }
  if (result.retryable && attempt < MAX_SEND_ATTEMPTS) {
    await prisma.communication.update({ where: { id: c.id }, data: { status: 'QUEUED', statusReason: `Attempt ${attempt} failed: ${result.error}` } });
    throw new Error(`send attempt ${attempt} failed: ${result.error}`);
  }
  await prisma.communication.update({ where: { id: c.id }, data: { status: 'FAILED', failedAt: new Date(), statusReason: result.error } });
  await onFailed?.(c, result.error);
  return { status: 'FAILED' };
}

/** Set by the notifications module (7.3), so a failed send reaches whoever queued it. */
let onFailed: ((c: Communication, error: string) => Promise<void>) | null = null;
export function onMessageFailed(fn: (c: Communication, error: string) => Promise<void>) { onFailed = fn; }

/** A person opened the message in their own WhatsApp or mail. TravelOS sent nothing. */
export async function logOpened(input: CommOpened, actorId: string | null) {
  const trip = input.tripId ? await prisma.trip.findUnique({ where: { id: input.tripId }, select: { customerId: true } }) : null;
  const customerId = input.customerId ?? trip?.customerId ?? null;
  if (!input.tripId && !customerId) throw new AppError('VALIDATION_ERROR', 400, 'Say which customer or trip the message is about');
  const c = await prisma.communication.create({
    data: {
      type: input.channel.toLowerCase(), channel: input.channel, via: 'APP', status: 'LOGGED', recipient: input.to, subject: input.subject, body: input.text,
      templateKey: input.templateKey, entityType: input.tripId ? 'trip' : 'customer', entityId: (input.tripId ?? customerId)!, tripId: input.tripId, customerId, userId: actorId,
    },
  });
  return commView(c, null);
}

function commView(c: Communication, by: string | null): CommView {
  const status = c.status as CommStatus;
  return {
    id: c.id, channel: (c.channel ?? (c.type === 'email' ? 'EMAIL' : c.type === 'whatsapp' ? 'WHATSAPP' : null)) as CommView['channel'],
    via: c.via === 'TRAVELOS' ? 'TRAVELOS' : 'APP', status, statusLabel: COMM_STATUS_LABEL[status] ?? status, reason: c.statusReason,
    to: c.recipient, subject: c.subject, text: c.body, templateKey: c.templateKey, source: c.source, by, at: c.createdAt.toISOString(),
  };
}

/** Everything sent or opened about a trip or a customer, newest first. */
export async function messageLog(q: CommLogQuery): Promise<CommView[]> {
  const or: Prisma.CommunicationWhereInput[] = [];
  if (q.tripId) or.push({ tripId: q.tripId }, { entityType: 'trip', entityId: q.tripId });
  if (q.customerId) or.push({ customerId: q.customerId }, { entityType: 'customer', entityId: q.customerId });
  const [rows, legacy] = await Promise.all([
    prisma.communication.findMany({ where: { OR: or }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.messageLog.findMany({ where: { OR: [...(q.tripId ? [{ tripId: q.tripId }] : []), ...(q.customerId ? [{ customerId: q.customerId }] : [])] }, orderBy: { sentAt: 'desc' }, take: 50 }),
  ]);
  const users = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map(r => r.userId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })).map(u => [u.id, u.name]));
  const views = rows.map(r => commView(r, r.userId ? users.get(r.userId) ?? null : null));
  // The classic scheduler's own record, shown as it was: sent or failed through the old gateway.
  for (const m of legacy) {
    const status: CommStatus = /sent|success/i.test(m.status) ? 'SENT' : 'FAILED';
    views.push({
      id: `legacy:${m.id}`, channel: m.channel.toLowerCase().includes('mail') ? 'EMAIL' : 'WHATSAPP', via: 'LEGACY', status,
      statusLabel: `${COMM_STATUS_LABEL[status]} (classic)`, reason: m.error, to: m.recipient, subject: null, text: m.content,
      templateKey: m.templateName, source: 'SYSTEM', by: null, at: m.sentAt.toISOString(),
    });
  }
  return views.sort((a, b) => b.at.localeCompare(a.at));
}

// ── Delivery updates from Meta ────────────────────────────────

interface MetaStatus { id: string; status: string; errors?: { title?: string; message?: string }[] }

/**
 * Applies Meta's delivery updates. The webhook carries no organisation, so
 * the message is found by Meta's id across organisations; a status never
 * moves backwards (a late "sent" does not undo "read").
 */
export async function applyWhatsAppStatuses(statuses: MetaStatus[]): Promise<number> {
  let n = 0;
  for (const s of statuses) {
    const c = await prismaUnscoped.communication.findFirst({ where: { providerMessageId: s.id } });
    if (!c) continue;
    const next = ({ sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' } as Record<string, CommStatus>)[s.status];
    if (!next) continue;
    if (next !== 'FAILED' && (ORDER[next] ?? 0) <= (ORDER[c.status] ?? -1)) continue;
    if (c.status === 'FAILED') continue;
    const reason = next === 'FAILED' ? (s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? 'Meta could not deliver it') : c.statusReason;
    const updated = await prismaUnscoped.communication.update({
      where: { id: c.id },
      data: {
        status: next, statusReason: reason,
        ...(next === 'DELIVERED' ? { deliveredAt: new Date() } : next === 'READ' ? { readAt: new Date(), deliveredAt: c.deliveredAt ?? new Date() } : next === 'FAILED' ? { failedAt: new Date() } : {}),
      },
    });
    if (next === 'FAILED') await onFailed?.(updated, reason ?? 'Meta could not deliver it');
    n++;
  }
  return n;
}

