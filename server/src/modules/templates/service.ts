// ============================================================
// Message templates. The system set (calc/templates.ts) is written for an
// organisation the first time it is needed and is never overwritten after
// that: the owner's edits are theirs. System templates can be edited and
// switched off, not deleted; the office can add its own.
// ============================================================

import type { MessageTemplate, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, conflict, notFound } from '../../core/errors.js';
import { SYSTEM_TEMPLATES, TEMPLATE_CHANNELS, placeholdersIn, type TemplateChannel } from '../../../../src/shared/calc/templates.js';
import type { TemplateCreate, TemplateUpdate, TemplateView } from '../../../../src/shared/contracts/templates.js';

export function templateView(t: MessageTemplate): TemplateView {
  return {
    id: t.id, key: t.key, channel: t.channel as TemplateChannel, name: t.name, purpose: t.purpose, subject: t.subject, body: t.body,
    metaTemplateName: t.metaTemplateName, metaLanguage: t.metaLanguage, isSystem: t.isSystem, enabled: t.enabled,
    placeholders: placeholdersIn(`${t.subject ?? ''} ${t.body}`), updatedAt: t.updatedAt.toISOString(),
  };
}

/** Adds any system template this organisation does not have yet. Idempotent; never overwrites. */
export async function ensureSystemTemplates(): Promise<number> {
  const r = await prisma.messageTemplate.createMany({
    skipDuplicates: true,
    data: SYSTEM_TEMPLATES.flatMap(t => TEMPLATE_CHANNELS.map(channel => ({
      key: t.key, channel, name: t.name, purpose: t.purpose, body: t.body, isSystem: true,
      subject: channel === 'EMAIL' ? t.subject : null,
    }))),
  });
  return r.count;
}

export async function listTemplates(): Promise<TemplateView[]> {
  await ensureSystemTemplates();
  const rows = await prisma.messageTemplate.findMany({ orderBy: [{ isSystem: 'desc' }, { key: 'asc' }, { channel: 'desc' }] });
  return rows.map(templateView);
}

/** The template to send with, or null when it does not exist or is switched off. */
export async function activeTemplate(key: string, channel: TemplateChannel): Promise<MessageTemplate | null> {
  await ensureSystemTemplates();
  const t = await prisma.messageTemplate.findFirst({ where: { key, channel } });
  return t && t.enabled ? t : null;
}

const snap = (t: MessageTemplate) => ({ name: t.name, subject: t.subject, body: t.body, enabled: t.enabled, metaTemplateName: t.metaTemplateName, metaLanguage: t.metaLanguage });

export async function createTemplate(input: TemplateCreate, actorId?: string | null): Promise<TemplateView> {
  await ensureSystemTemplates();
  if (await prisma.messageTemplate.findFirst({ where: { key: input.key, channel: input.channel } })) throw conflict(`A ${input.channel.toLowerCase()} template called ${input.key} already exists`);
  const row = await prisma.$transaction(async tx => {
    const t = await tx.messageTemplate.create({ data: { ...input, subject: input.channel === 'EMAIL' ? input.subject : null, isSystem: false, updatedById: actorId ?? null } });
    await audit(tx, { action: 'template_created', entityType: 'message_template', entityId: t.id, userId: actorId, description: `Template "${t.name}" (${t.channel}) added`, after: snap(t) });
    return t;
  });
  return templateView(row);
}

export async function updateTemplate(id: string, patch: TemplateUpdate, actorId?: string | null): Promise<TemplateView> {
  const before = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!before) throw notFound('Template');
  const data: Prisma.MessageTemplateUpdateInput = { ...patch, updatedById: actorId ?? null };
  if (before.channel === 'WHATSAPP') data.subject = null;
  if (before.channel === 'EMAIL' && patch.subject === null) throw new AppError('VALIDATION_ERROR', 400, 'An email needs a subject', { subject: 'Required' });
  const row = await prisma.$transaction(async tx => {
    const t = await tx.messageTemplate.update({ where: { id }, data });
    await audit(tx, { action: 'template_updated', entityType: 'message_template', entityId: id, userId: actorId, description: `Template "${t.name}" (${t.channel}) changed`, before: snap(before), after: snap(t) });
    return t;
  });
  return templateView(row);
}

/** Resets a system template to the wording TravelOS ships with. */
export async function resetTemplate(id: string, actorId?: string | null): Promise<TemplateView> {
  const before = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!before) throw notFound('Template');
  const def = SYSTEM_TEMPLATES.find(t => t.key === before.key);
  if (!before.isSystem || !def) throw new AppError('STATE_CONFLICT', 409, 'Only a system template can be reset');
  return updateTemplate(id, { name: def.name, body: def.body, subject: before.channel === 'EMAIL' ? def.subject : null }, actorId);
}

export async function deleteTemplate(id: string, actorId?: string | null): Promise<void> {
  const t = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!t) throw notFound('Template');
  if (t.isSystem) throw new AppError('STATE_CONFLICT', 409, 'System templates are switched off, not deleted');
  await prisma.$transaction(async tx => {
    await tx.messageTemplate.delete({ where: { id } });
    await audit(tx, { action: 'template_deleted', entityType: 'message_template', entityId: id, userId: actorId, description: `Template "${t.name}" (${t.channel}) removed`, before: snap(t) });
  });
}
