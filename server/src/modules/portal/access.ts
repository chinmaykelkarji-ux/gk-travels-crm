// ============================================================
// Portal access — the private link to a customer's own page.
//
//   issue    a 256-bit random token; only its SHA-256 is stored, and the
//            link is shown once. It lapses (1–365 days) and can be revoked.
//   code     optionally the link also needs a six-digit code sent to the
//            customer through a configured channel: valid 10 minutes, five
//            tries, one send a minute; only its HMAC is stored
//   session  after the code, a signed cookie for 12 hours, scoped to
//            /api/portal and to this one link
//
// A link opens exactly one customer's page, in that customer's organisation.
// Nothing here can reach another customer or any staff route.
// ============================================================

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { PortalAccess } from '@prisma/client';
import { prisma, prismaUnscoped } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notConfigured, notFound } from '../../core/errors.js';
import { channelConfigured } from '../../comms/index.js';
import { sendMessage } from '../comms/service.js';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_RESEND_MS = 60 * 1000;
export const SESSION_TTL_S = 12 * 60 * 60;
export const PORTAL_COOKIE = 'gk_portal';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const hashCode = (accessId: string, code: string) => createHmac('sha256', String(process.env.JWT_SECRET)).update(`${accessId}:${code}`).digest('hex');

/** Where customers open their page; null when the server does not know its own address. */
export function portalBaseUrl(): string | null {
  const base = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL;
  return base ? base.replace(/\/+$/, '') : null;
}

export interface IssueInput { customerId: string; days: number; requireCode: boolean; codeChannel?: 'WHATSAPP' | 'EMAIL' | null; label?: string | null }

export async function issueAccess(input: IssueInput, actorId?: string | null) {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true, name: true, phone: true, email: true } });
  if (!customer) throw notFound('Customer');
  if (input.requireCode) {
    const ch = input.codeChannel;
    if (!ch) throw new AppError('VALIDATION_ERROR', 400, 'Choose how the code is sent', { codeChannel: 'Required' });
    if (!channelConfigured(ch)) throw notConfigured(ch === 'WHATSAPP' ? 'WhatsApp' : 'Email');
    if (ch === 'EMAIL' ? !customer.email : !customer.phone) throw new AppError('VALIDATION_ERROR', 400, `The customer has no ${ch === 'EMAIL' ? 'email address' : 'phone number'} for the code`);
  }
  const token = randomBytes(32).toString('base64url');
  const access = await prisma.$transaction(async tx => {
    const a = await tx.portalAccess.create({
      data: {
        customerId: customer.id, tokenHash: hashToken(token), label: input.label ?? null,
        expiresAt: new Date(Date.now() + input.days * 86_400_000), requireCode: input.requireCode,
        codeChannel: input.requireCode ? input.codeChannel ?? null : null, createdById: actorId ?? null,
      },
    });
    await audit(tx, {
      action: 'portal_link_issued', entityType: 'customer', entityId: customer.id, userId: actorId,
      description: `Private page link for ${customer.name}, valid ${input.days} day(s)${input.requireCode ? `, code by ${input.codeChannel === 'EMAIL' ? 'email' : 'WhatsApp'}` : ''}`,
      metadata: { portalAccessId: a.id },
    });
    return a;
  });
  const base = portalBaseUrl();
  return { access: accessView(access), path: `/p/${token}`, url: base ? `${base}/p/${token}` : null };
}

export function accessView(a: PortalAccess) {
  const now = Date.now();
  return {
    id: a.id, customerId: a.customerId, label: a.label, expiresAt: a.expiresAt.toISOString(), requireCode: a.requireCode, codeChannel: a.codeChannel,
    state: a.revokedAt ? 'REVOKED' : a.expiresAt.getTime() < now ? 'EXPIRED' : 'ACTIVE',
    lastUsedAt: a.lastUsedAt?.toISOString() ?? null, useCount: a.useCount, createdAt: a.createdAt.toISOString(),
  };
}

export async function listAccess(customerId: string) {
  const rows = await prisma.portalAccess.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 50 });
  return rows.map(accessView);
}

export async function revokeAccess(id: string, actorId?: string | null) {
  const a = await prisma.portalAccess.findUnique({ where: { id } });
  if (!a) throw notFound('Link');
  if (a.revokedAt) return accessView(a);
  const row = await prisma.$transaction(async tx => {
    const r = await tx.portalAccess.update({ where: { id }, data: { revokedAt: new Date(), revokedById: actorId ?? null } });
    await audit(tx, { action: 'portal_link_revoked', entityType: 'customer', entityId: a.customerId, userId: actorId, description: 'Private page link revoked', metadata: { portalAccessId: id } });
    return r;
  });
  return accessView(row);
}

// ── The customer's side ───────────────────────────────────────

/**
 * The link behind a token, found across organisations (the customer has no
 * session yet). An unknown, lapsed or revoked link is simply "not found".
 */
export async function resolveToken(token: string): Promise<PortalAccess> {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) throw notFound('Page');
  const a = await prismaUnscoped.portalAccess.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!a || a.revokedAt || a.expiresAt.getTime() < Date.now()) throw notFound('Page');
  return a;
}

export function sessionFor(a: PortalAccess): string {
  return jwt.sign({ aid: a.id, typ: 'portal' }, String(process.env.JWT_SECRET), { expiresIn: SESSION_TTL_S });
}

/** True when this request may see the page: no code needed, or a valid session for this link. */
export function unlocked(a: PortalAccess, cookie: string | undefined): boolean {
  if (!a.requireCode) return true;
  if (!cookie) return false;
  try {
    const p = jwt.verify(cookie, String(process.env.JWT_SECRET)) as { aid?: string; typ?: string };
    return p.typ === 'portal' && p.aid === a.id;
  } catch { return false; }
}

export async function recordVisit(a: PortalAccess) {
  await prisma.portalAccess.update({ where: { id: a.id }, data: { lastUsedAt: new Date(), useCount: { increment: 1 } } });
}

/** Sends a fresh code through the link's channel. At most one a minute. */
export async function sendCode(a: PortalAccess): Promise<{ sentTo: string }> {
  if (!a.requireCode || !a.codeChannel) throw new AppError('STATE_CONFLICT', 409, 'This page does not need a code');
  if (a.codeSentAt && Date.now() - a.codeSentAt.getTime() < CODE_RESEND_MS) throw new AppError('RATE_LIMITED', 429, 'A code was sent a moment ago. Please wait a minute before asking again.');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.portalAccess.update({ where: { id: a.id }, data: { codeHash: hashCode(a.id, code), codeExpiresAt: new Date(Date.now() + CODE_TTL_MS), codeSentAt: new Date(), codeAttempts: 0 } });
  const m = await sendMessage({ templateKey: 'portal_code', channel: a.codeChannel as 'WHATSAPP' | 'EMAIL', customerId: a.customerId, tripId: null, receiptId: null, ticketId: null, travellerId: null, to: null }, null, 'AUTOMATION', null, { code });
  // Only the last digits of where it went, so the page does not reveal the contact.
  const to = m.to.includes('@') ? m.to.replace(/^(.).*(@.*)$/, '$1•••$2') : `•••• ${m.to.replace(/\D/g, '').slice(-4)}`;
  return { sentTo: to };
}

export async function verifyCode(a: PortalAccess, code: string): Promise<string> {
  if (!a.requireCode) return sessionFor(a);
  const fresh = await prisma.portalAccess.findUniqueOrThrow({ where: { id: a.id } });
  if (!fresh.codeHash || !fresh.codeExpiresAt || fresh.codeExpiresAt.getTime() < Date.now()) throw new AppError('VALIDATION_ERROR', 400, 'The code has lapsed. Ask for a new one.');
  if (fresh.codeAttempts >= CODE_MAX_ATTEMPTS) throw new AppError('RATE_LIMITED', 429, 'Too many tries. Ask for a new code.');
  const given = Buffer.from(hashCode(a.id, code.trim()));
  const ok = given.length === Buffer.from(fresh.codeHash).length && timingSafeEqual(given, Buffer.from(fresh.codeHash));
  if (!ok) {
    await prisma.portalAccess.update({ where: { id: a.id }, data: { codeAttempts: { increment: 1 } } });
    throw new AppError('VALIDATION_ERROR', 400, 'That code is not right. Please check and try again.');
  }
  await prisma.portalAccess.update({ where: { id: a.id }, data: { codeHash: null, codeExpiresAt: null, codeAttempts: 0 } });
  return sessionFor(a);
}
