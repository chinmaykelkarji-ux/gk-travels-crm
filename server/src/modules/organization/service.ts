// ============================================================
// The organisation: its settings, a setup checklist, and creating a new one.
//
// Settings live in organizations.settings and are read through
// readSettings() so a missing or bad value falls back to the default.
// The setup checklist says honestly what is and is not set up — each item
// is a real check on the database or the server's configuration.
// A new organisation is created only by the platform operator (a separate
// secret), with its own company profile and first owner; everything else
// (ledger accounts, templates, automation rules) is written on first use.
// ============================================================

import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma, prismaUnscoped } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { conflict, notFound } from '../../core/errors.js';
import { currentOrganizationId, runWithContext } from '../../core/requestContext.js';
import { isStorageConfigured } from '../../core/storage.js';
import { aiStatus } from '../../ai/index.js';
import { channelStatus } from '../../comms/index.js';
import { portalBaseUrl } from '../portal/access.js';
import { readSettings, type OrganizationCreate, type OrgSettings, type OrgSettingsPatch } from '../../../../src/shared/contracts/organization.js';

export async function getSettings(): Promise<OrgSettings> {
  const org = await prismaUnscoped.organization.findUnique({ where: { id: currentOrganizationId() }, select: { settings: true } });
  return readSettings(org?.settings);
}

export async function getOrganization() {
  const org = await prismaUnscoped.organization.findUnique({ where: { id: currentOrganizationId() } });
  if (!org) throw notFound('Organisation');
  return { id: org.id, slug: org.slug, name: org.name, legalName: org.legalName, currency: org.currency, timezone: org.timezone, settings: readSettings(org.settings) };
}

export async function updateSettings(patch: OrgSettingsPatch, actorId?: string | null) {
  const id = currentOrganizationId();
  const before = await prismaUnscoped.organization.findUniqueOrThrow({ where: { id } });
  const current = readSettings(before.settings);
  const next: OrgSettings = { insights: { ...current.insights, ...(patch.insights ?? {}) }, portal: { ...current.portal, ...(patch.portal ?? {}) } };
  await prisma.$transaction(async tx => {
    await tx.organization.update({ where: { id }, data: { settings: next as unknown as Prisma.InputJsonValue, ...(patch.name ? { name: patch.name } : {}), ...(patch.legalName !== undefined ? { legalName: patch.legalName } : {}) } });
    await audit(tx, { action: 'organization_settings_updated', entityType: 'organization', entityId: id, userId: actorId, description: 'Organisation settings changed', before: { name: before.name, settings: current as unknown as Prisma.JsonValue }, after: { name: patch.name ?? before.name, settings: next as unknown as Prisma.JsonValue } });
  });
  return getOrganization();
}

export interface SetupItem { key: string; title: string; done: boolean; detail: string; link: string | null }

/** What is set up and what is not — every item a real check. */
export async function setupChecklist(): Promise<{ done: number; total: number; items: SetupItem[] }> {
  const [company, people, taxRules, templates, rules, customers] = await Promise.all([
    prisma.companySettings.findFirst(),
    prisma.user.groupBy({ by: ['role'], where: { isActive: true }, _count: { _all: true } }),
    prisma.taxRule.count(),
    prisma.messageTemplate.count({ where: { channel: 'WHATSAPP', metaTemplateName: { not: null }, enabled: true } }),
    prisma.automationRule.count({ where: { enabled: true } }),
    prisma.customer.count(),
  ]);
  const ai = aiStatus();
  const comms = channelStatus();
  const staff = people.filter(p => p.role !== 'ADMIN' && p.role !== 'DRIVER').reduce((s, p) => s + p._count._all, 0);
  const WORDS: Record<string, string> = { companyName: 'name', gstin: 'GSTIN', stateCode: 'state', addressLine1: 'address', phone: 'phone', email: 'email', bankName: 'bank name', bankAccountNumber: 'account number', bankIfsc: 'IFSC' };
  const profileMissing = company ? (['companyName', 'gstin', 'stateCode', 'addressLine1', 'phone', 'email'] as const).filter(k => !company[k]).map(k => WORDS[k]) : ['everything'];
  const bankMissing = company ? (['bankName', 'bankAccountNumber', 'bankIfsc'] as const).filter(k => !company[k]).map(k => WORDS[k]) : ['bank details'];
  const items: SetupItem[] = [
    { key: 'profile', title: 'Company profile', done: profileMissing.length === 0, detail: profileMissing.length ? `Still missing: ${profileMissing.join(', ')}` : 'Name, GSTIN, state, address, phone and email are on invoices and messages.', link: '/settings' },
    { key: 'bank', title: 'Bank details for invoices', done: bankMissing.length === 0, detail: bankMissing.length ? `Still missing: ${bankMissing.join(', ')}` : 'Printed on invoices.', link: '/settings' },
    { key: 'team', title: 'Your team', done: staff > 0, detail: staff ? `${staff} staff member(s) besides the owner.` : 'Only the owner can sign in so far.', link: '/users' },
    { key: 'tax', title: 'Tax rates', done: taxRules > 0, detail: taxRules ? 'Set by you; verify with the CA.' : 'The shipped defaults are in use until you confirm them — verify with the CA.', link: '/settings/tax-rates' },
    { key: 'whatsapp', title: 'WhatsApp (Meta Cloud API)', done: comms.whatsapp.configured, detail: comms.whatsapp.hint ?? 'Configured.', link: '/settings/messaging' },
    { key: 'meta_templates', title: 'WhatsApp templates approved by Meta', done: templates > 0, detail: templates ? `${templates} template(s) carry an approved Meta name.` : 'No template has a Meta-approved name yet, so TravelOS cannot send WhatsApp by itself.', link: '/settings/templates' },
    { key: 'email', title: 'Email (SMTP)', done: comms.email.configured, detail: comms.email.hint ?? 'Configured.', link: '/settings/messaging' },
    { key: 'storage', title: 'Document storage', done: isStorageConfigured(), detail: isStorageConfigured() ? 'Files are kept privately.' : 'Documents cannot be uploaded until storage is configured.', link: '/settings/ai' },
    { key: 'ai', title: 'AI (reading documents and the copilot)', done: ai.extraction.configured && ai.copilot.configured, detail: ai.copilot.hint ?? ai.extraction.hint ?? 'Configured.', link: '/settings/ai' },
    { key: 'scheduler', title: 'Background jobs', done: Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16), detail: process.env.CRON_SECRET ? 'The scheduler can run reminders, sends and imports.' : 'Set CRON_SECRET and point the scheduler at /api/jobs/tick — until then nothing runs in the background.', link: null },
    { key: 'encryption', title: 'Identity data encryption', done: Boolean(process.env.DATA_ENCRYPTION_KEY), detail: process.env.DATA_ENCRYPTION_KEY ? 'Aadhaar and passport numbers are encrypted.' : 'Set DATA_ENCRYPTION_KEY on the server before storing identity numbers.', link: null },
    { key: 'portal', title: 'Customer page address', done: Boolean(portalBaseUrl()), detail: portalBaseUrl() ? `Links look like ${portalBaseUrl()}/p/…` : 'Set PUBLIC_APP_URL so private links can be sent in messages.', link: null },
    { key: 'automations', title: 'Automations reviewed', done: rules > 0, detail: rules ? `${rules} rule(s) switched on.` : 'No rule is switched on.', link: '/settings/automations' },
    { key: 'customers', title: 'First customers', done: customers > 0, detail: customers ? `${customers} customer(s).` : 'Add or import your customers.', link: '/customers' },
  ];
  return { done: items.filter(i => i.done).length, total: items.length, items };
}

/** A new organisation with its company profile and first owner. Platform operator only. */
export async function createOrganization(input: OrganizationCreate) {
  if (await prismaUnscoped.organization.findUnique({ where: { slug: input.slug } })) throw conflict(`An organisation "${input.slug}" already exists`);
  if (await prismaUnscoped.user.findUnique({ where: { email: input.adminEmail } })) throw conflict('That email already signs in to TravelOS');
  const org = await prismaUnscoped.organization.create({ data: { slug: input.slug, name: input.name, settings: {} } });
  const passwordHash = await bcrypt.hash(input.adminPassword, 12);
  const admin = await runWithContext({ organizationId: org.id, source: 'SYSTEM' }, async () => {
    await prisma.companySettings.create({ data: { companyName: input.name } as Prisma.CompanySettingsUncheckedCreateInput });
    const user = await prisma.user.create({ data: { name: input.adminName, email: input.adminEmail, passwordHash, role: 'ADMIN', isActive: true } });
    await audit(prisma, { action: 'organization_created', entityType: 'organization', entityId: org.id, description: `Organisation "${input.name}" created with owner ${input.adminEmail}` });
    return user;
  });
  return { organization: { id: org.id, slug: org.slug, name: org.name }, owner: { id: admin.id, email: admin.email } };
}
