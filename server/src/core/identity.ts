// ============================================================
// Identity fields — the only code that reads or writes sealed passport and
// government-ID numbers (hard rule 7).
//
// Storage per field: <field>Enc (AES-GCM, core/crypto.ts), <field>Hash
// (blind index for duplicate checks and exact search) and <field>Last4 (for
// the mask). The legacy plaintext column is only ever cleared, never
// written; rows created before encryption are sealed by the
// `identity.encrypt-legacy` job.
//
// API responses carry the masked form (XXXX-XXXX-1234) in the familiar
// field name, so legacy screens keep rendering. A client that sends a masked
// value back means "unchanged". Full values leave the server only through
// reveal*(), and every reveal writes an audit row.
// ============================================================

import { prisma, type DbClient } from '../lib/prisma.js';
import { audit } from './audit.js';
import { notFound, badRequest } from './errors.js';
import { seal, open, blindIndex } from './crypto.js';
import { isMaskedValue, last4, maskFromLast4, maskIdNumber, normalizeIdNumber } from '../../../src/shared/calc/identity.js';

/** Blind-index purposes. Travellers and customers share "passport" so a clash can be found across both. */
const INDEX = { passport: 'passport', govtId: 'govt-id' } as const;

interface FieldSpec { plain: string; enc: string; hash: string; last4: string; aad: string; index: string }

const TRAVELLER_PASSPORT: FieldSpec = { plain: 'passportNumber', enc: 'passportNumberEnc', hash: 'passportNumberHash', last4: 'passportLast4', aad: 'traveller.passportNumber', index: INDEX.passport };
const TRAVELLER_GOVT_ID: FieldSpec  = { plain: 'govtIdNumber', enc: 'govtIdNumberEnc', hash: 'govtIdNumberHash', last4: 'govtIdLast4', aad: 'traveller.govtIdNumber', index: INDEX.govtId };
const CUSTOMER_PASSPORT: FieldSpec  = { plain: 'passportNo', enc: 'passportNoEnc', hash: 'passportNoHash', last4: 'passportNoLast4', aad: 'customer.passportNo', index: INDEX.passport };

export function passportHash(value: string): string {
  return blindIndex(value, INDEX.passport);
}

/** Columns to write for one incoming value: {} when unchanged, cleared columns for null/'', sealed columns otherwise. */
function fieldData(spec: FieldSpec, value: unknown): Record<string, string | null> {
  if (value === undefined || isMaskedValue(value)) return {};
  const clean = typeof value === 'string' ? normalizeIdNumber(value) : '';
  if (!clean) return { [spec.plain]: null, [spec.enc]: null, [spec.hash]: null, [spec.last4]: null };
  return { [spec.plain]: null, [spec.enc]: seal(clean, spec.aad), [spec.hash]: blindIndex(clean, spec.index), [spec.last4]: last4(clean) };
}

type TravellerIdentityColumns = Partial<Record<'passportNumber' | 'passportNumberEnc' | 'passportNumberHash' | 'passportLast4' | 'govtIdNumber' | 'govtIdNumberEnc' | 'govtIdNumberHash' | 'govtIdLast4', string | null>>;
type CustomerIdentityColumns = Partial<Record<'passportNo' | 'passportNoEnc' | 'passportNoHash' | 'passportNoLast4', string | null>>;

export function travellerIdentityData(input: { passportNumber?: unknown; govtIdNumber?: unknown }): TravellerIdentityColumns {
  return { ...fieldData(TRAVELLER_PASSPORT, input.passportNumber), ...fieldData(TRAVELLER_GOVT_ID, input.govtIdNumber) };
}

export function customerIdentityData(input: { passportNo?: unknown }): CustomerIdentityColumns {
  return fieldData(CUSTOMER_PASSPORT, input.passportNo);
}

// ── Presentation ──────────────────────────────────────────────

const SEALED_KEYS = new Set(['passportNumberEnc', 'passportNumberHash', 'passportLast4', 'govtIdNumberEnc', 'govtIdNumberHash', 'govtIdLast4', 'passportNoEnc', 'passportNoHash', 'passportNoLast4']);

function masked(row: Record<string, unknown>, spec: FieldSpec): string | null {
  const l4 = row[spec.last4];
  if (typeof l4 === 'string' && l4) return maskFromLast4(l4);
  const legacy = row[spec.plain];
  return typeof legacy === 'string' && legacy ? maskIdNumber(legacy) : null;
}

function strip<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!SEALED_KEYS.has(k)) out[k] = v;
  return out as T;
}

/** A traveller row as the API returns it: identity numbers masked, sealed columns removed. */
export function presentTraveller<T extends Record<string, unknown>>(row: T): T {
  const hasPassport = 'passportNumber' in row || 'passportLast4' in row;
  const hasGovt = 'govtIdNumber' in row || 'govtIdLast4' in row;
  return strip({
    ...row,
    ...(hasPassport ? { passportNumber: masked(row, TRAVELLER_PASSPORT) } : {}),
    ...(hasGovt ? { govtIdNumber: masked(row, TRAVELLER_GOVT_ID) } : {}),
  });
}

export function presentCustomer<T extends Record<string, unknown>>(row: T): T {
  const has = 'passportNo' in row || 'passportNoLast4' in row;
  return strip({ ...row, ...(has ? { passportNo: masked(row, CUSTOMER_PASSPORT) } : {}) });
}

/** Select fragments that carry what presentTraveller() needs to build the mask. */
export const TRAVELLER_MASK_SELECT = { passportNumber: true, passportLast4: true } as const;

// ── Reveal (audited) ──────────────────────────────────────────

function openField(row: Record<string, unknown>, spec: FieldSpec): string | null {
  const enc = row[spec.enc];
  if (typeof enc === 'string' && enc) return open(enc, spec.aad);
  const legacy = row[spec.plain];
  return typeof legacy === 'string' && legacy ? legacy : null;
}

export type TravellerIdField = 'passportNumber' | 'govtIdNumber';

export async function revealTravellerId(id: string, field: TravellerIdField, actorId?: string | null, reason?: string | null) {
  const t = await prisma.traveller.findUnique({ where: { id } });
  if (!t || t.deletedAt) throw notFound('Traveller');
  const spec = field === 'passportNumber' ? TRAVELLER_PASSPORT : TRAVELLER_GOVT_ID;
  const value = openField(t as unknown as Record<string, unknown>, spec);
  if (!value) throw badRequest('Nothing on file to reveal');
  await audit(prisma, {
    action: 'identity_revealed', entityType: 'traveller', entityId: id, userId: actorId,
    description: `${field === 'passportNumber' ? 'Passport number' : `${t.govtIdType ?? 'ID'} number`} of ${t.firstName} ${t.lastName} viewed${reason ? ` — ${reason}` : ''}`,
    metadata: { field, reason: reason ?? null },
  });
  return { field, value };
}

export async function revealCustomerPassport(id: string, actorId?: string | null, reason?: string | null) {
  const c = await prisma.customer.findUnique({ where: { id } });
  if (!c || c.deletedAt) throw notFound('Customer');
  const value = openField(c as unknown as Record<string, unknown>, CUSTOMER_PASSPORT);
  if (!value) throw badRequest('Nothing on file to reveal');
  await audit(prisma, {
    action: 'identity_revealed', entityType: 'customer', entityId: id, userId: actorId,
    description: `Passport number of ${c.name} viewed${reason ? ` — ${reason}` : ''}`, metadata: { field: 'passportNo', reason: reason ?? null },
  });
  return { field: 'passportNo', value };
}

/** Decrypts for server-side use that the caller has already authorised (e.g. an airline manifest export). Audit at the call site. */
export function openTravellerPassport(row: { passportNumber?: string | null; passportNumberEnc?: string | null }): string | null {
  return openField(row as Record<string, unknown>, TRAVELLER_PASSPORT);
}

// ── Legacy plaintext → sealed (job `identity.encrypt-legacy`) ──

export async function encryptLegacyIdentityBatch(db: DbClient = prisma, limit = 200): Promise<{ travellers: number; customers: number }> {
  const travellers = await db.traveller.findMany({
    where: { OR: [{ passportNumber: { not: null } }, { govtIdNumber: { not: null } }] },
    select: { id: true, passportNumber: true, govtIdNumber: true }, take: limit,
  });
  for (const t of travellers) {
    await db.traveller.update({
      where: { id: t.id },
      data: {
        ...(t.passportNumber ? (isMaskedValue(t.passportNumber) ? { passportNumber: null } : fieldData(TRAVELLER_PASSPORT, t.passportNumber)) : {}),
        ...(t.govtIdNumber ? (isMaskedValue(t.govtIdNumber) ? { govtIdNumber: null } : fieldData(TRAVELLER_GOVT_ID, t.govtIdNumber)) : {}),
      },
    });
  }
  const customers = await db.customer.findMany({ where: { passportNo: { not: null } }, select: { id: true, passportNo: true }, take: limit });
  for (const c of customers) {
    await db.customer.update({ where: { id: c.id }, data: isMaskedValue(c.passportNo) ? { passportNo: null } : fieldData(CUSTOMER_PASSPORT, c.passportNo) });
  }
  if (travellers.length || customers.length) {
    await audit(db, {
      action: 'identity_encrypted', entityType: 'system', entityId: 'identity', source: 'SYSTEM',
      description: `Encrypted identity numbers held in clear: ${travellers.length} traveller(s), ${customers.length} customer(s)`,
      metadata: { travellers: travellers.length, customers: customers.length },
    });
  }
  return { travellers: travellers.length, customers: customers.length };
}
