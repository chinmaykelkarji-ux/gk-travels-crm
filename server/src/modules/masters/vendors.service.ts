// ============================================================
// Vendors v2 — the one supplier master (DMCs, air consolidators, hotels,
// cab owners, activity providers …). Same table the classic Suppliers screen
// uses; `kind` is the typed classification and `type` is kept in step for it.
// Bank details are accepted from and shown to finance roles only.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { nextDisplayId } from '../../core/numbering.js';
import { AppError, notFound } from '../../core/errors.js';
import { canSeeBankDetails } from '../../lib/redact.js';
import { normalizePhone } from '../../../../src/shared/calc/phone.js';
import { legacyTypeFromKind, type MasterListQuery, type VendorInput, type VendorUpdate, type VendorKind } from '../../../../src/shared/contracts/masters.js';
import { changedKeys, pick, page, today } from './common.js';

type Row = Prisma.VendorGetPayload<{ include: { _count: { select: { hotels: true; vehicles: true; drivers: true; activities: true } } } }>;

function toDto(v: Row, role: string | undefined) {
  return {
    id: v.id, name: v.name, kind: v.kind, companyName: v.companyName, contactPerson: v.contactPerson, phone: v.phone, whatsapp: v.whatsapp, email: v.email,
    city: v.city, state: v.state, address: v.address, gstNumber: v.gstNumber, pan: canSeeBankDetails(role) ? v.pan : null,
    destinations: Array.isArray(v.destinations) ? v.destinations : [], paymentTerms: v.paymentTerms, creditDays: v.creditDays,
    bankDetails: canSeeBankDetails(role) ? (v.bankDetails as Record<string, unknown>) : null,
    notes: v.notes, isActive: v.isActive, createdAt: v.createdAt.toISOString(),
    counts: { hotels: v._count.hotels, vehicles: v._count.vehicles, drivers: v._count.drivers, activities: v._count.activities },
  };
}
export type VendorDto = ReturnType<typeof toDto>;

const COUNTS = { _count: { select: { hotels: true, vehicles: true, drivers: true, activities: true } } } as const;

export async function listVendors(q: MasterListQuery, role: string | undefined) {
  const term = q.q?.trim();
  const digits = term ? normalizePhone(term) : null;
  const where: Prisma.VendorWhereInput = {
    ...(q.includeInactive ? {} : { isActive: true }),
    ...(q.kind ? { kind: q.kind as VendorKind } : {}),
    ...(q.city ? { city: { equals: q.city, mode: 'insensitive' } } : {}),
    ...(term ? { OR: [
      { name: { contains: term, mode: 'insensitive' } }, { companyName: { contains: term, mode: 'insensitive' } },
      { contactPerson: { contains: term, mode: 'insensitive' } }, { gstNumber: { contains: term, mode: 'insensitive' } }, { id: { contains: term, mode: 'insensitive' } },
      ...(digits && digits.length >= 4 ? [{ phoneNormalized: { contains: digits } }] : []),
    ] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.vendor.findMany({ where, orderBy: [{ isActive: 'desc' }, { name: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: COUNTS }),
    prisma.vendor.count({ where }),
  ]);
  return page(rows.map(r => toDto(r, role)), total, q);
}

export async function getVendor(id: string, role: string | undefined) {
  const v = await prisma.vendor.findUnique({
    where: { id },
    include: {
      ...COUNTS,
      hotels:     { select: { id: true, name: true, city: true, isActive: true }, orderBy: { name: 'asc' } },
      vehicles:   { select: { id: true, registrationNo: true, type: true, seats: true, isActive: true }, orderBy: { registrationNo: 'asc' } },
      drivers:    { select: { id: true, name: true, phone: true, isActive: true }, orderBy: { name: 'asc' } },
      activities: { select: { id: true, name: true, city: true, isActive: true }, orderBy: { name: 'asc' } },
    },
  });
  if (!v) throw notFound('Vendor');
  const activity = await prisma.activityLog.findMany({ where: { entityType: 'vendor', entityId: id }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, action: true, description: true, timestamp: true, userId: true, source: true } });
  return { ...toDto(v, role), hotels: v.hotels, vehicles: v.vehicles, drivers: v.drivers, activities: v.activities, activity };
}

async function findDuplicate(db: DbClient, phone: string | undefined, gstNumber: string | null | undefined, excludeId?: string) {
  const ors: Prisma.VendorWhereInput[] = [];
  const p = normalizePhone(phone);
  if (p) ors.push({ phoneNormalized: p });
  if (gstNumber) ors.push({ gstNumber: { equals: gstNumber, mode: 'insensitive' } });
  if (!ors.length) return null;
  return db.vendor.findFirst({ where: { OR: ors, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true, name: true, gstNumber: true, phoneNormalized: true } });
}

/** VEN-YYYY-NNNN from the sequence, skipping ids the classic screen generated client-side. */
export async function nextVendorId(db: DbClient): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const id = await nextDisplayId(db, 'VEN');
    if (!(await db.vendor.findUnique({ where: { id }, select: { id: true } }))) return id;
  }
  throw new Error('Could not allocate a vendor id');
}

export function vendorCreateData(id: string, input: Omit<VendorInput, 'force'>, role: string | undefined): Prisma.VendorUncheckedCreateInput {
  const { bankDetails, destinations, ...rest } = input;
  return {
    id, ...rest, type: legacyTypeFromKind(input.kind), phoneNormalized: normalizePhone(input.phone),
    destinations: destinations as Prisma.InputJsonValue,
    bankDetails: (canSeeBankDetails(role) && bankDetails ? bankDetails : {}) as Prisma.InputJsonValue,
    createdDate: today(),
  };
}

export async function createVendor(input: VendorInput, role: string | undefined, actorId?: string | null) {
  if (!input.force) {
    const dup = await findDuplicate(prisma, input.phone, input.gstNumber);
    if (dup) throw new AppError('CONFLICT', 409, `${dup.name} (${dup.id}) already has this ${input.gstNumber && dup.gstNumber?.toUpperCase() === input.gstNumber ? 'GSTIN' : 'phone number'}`, { existingVendorId: dup.id });
  }
  const { force: _f, ...data } = input;
  const v = await prisma.$transaction(async tx => {
    const id = await nextVendorId(tx);
    const created = await tx.vendor.create({ data: vendorCreateData(id, data, role), include: COUNTS });
    await audit(tx, { action: 'vendor_created', entityType: 'vendor', entityId: id, userId: actorId, description: `Vendor ${created.name} (${created.kind}) added`, after: { name: created.name, kind: created.kind, phone: created.phone, gstNumber: created.gstNumber } });
    return created;
  });
  return toDto(v, role);
}

const AUDITED = ['name', 'kind', 'companyName', 'contactPerson', 'phone', 'whatsapp', 'email', 'city', 'state', 'address', 'gstNumber', 'pan', 'destinations', 'paymentTerms', 'creditDays', 'notes', 'isActive'];

export async function updateVendor(id: string, input: VendorUpdate, role: string | undefined, actorId?: string | null) {
  const before = await prisma.vendor.findUnique({ where: { id } });
  if (!before) throw notFound('Vendor');
  if (input.phone !== undefined || input.gstNumber !== undefined) {
    const dup = await findDuplicate(prisma, input.phone, input.gstNumber, id);
    if (dup) throw new AppError('CONFLICT', 409, `${dup.name} (${dup.id}) already has this phone number or GSTIN`, { existingVendorId: dup.id });
  }
  const { bankDetails, destinations, ...rest } = input;
  const data: Prisma.VendorUncheckedUpdateInput = {
    ...rest,
    ...(input.kind ? { type: legacyTypeFromKind(input.kind) } : {}),
    ...(input.phone ? { phoneNormalized: normalizePhone(input.phone) } : {}),
    ...(destinations ? { destinations: destinations as Prisma.InputJsonValue } : {}),
    // Non-finance roles cannot set or wipe the account the accounts team pays into.
    ...(bankDetails !== undefined && canSeeBankDetails(role) ? { bankDetails: bankDetails as Prisma.InputJsonValue } : {}),
  };
  const after = await prisma.$transaction(async tx => {
    const a = await tx.vendor.update({ where: { id }, data, include: COUNTS });
    const keys = changedKeys(before as unknown as Record<string, unknown>, a as unknown as Record<string, unknown>, AUDITED);
    const bankChanged = JSON.stringify(before.bankDetails) !== JSON.stringify(a.bankDetails);
    await audit(tx, {
      action: 'vendor_updated', entityType: 'vendor', entityId: id, userId: actorId,
      description: `Vendor ${a.name} updated (${[...keys, ...(bankChanged ? ['bank details'] : [])].join(', ') || 'no changes'})`,
      before: pick(before as unknown as Record<string, unknown>, keys), after: pick(a as unknown as Record<string, unknown>, keys),
      metadata: bankChanged ? { bankDetailsChanged: true } : undefined,
    });
    return a;
  });
  return toDto(after, role);
}

export async function setVendorActive(id: string, isActive: boolean, role: string | undefined, actorId?: string | null) {
  return updateVendor(id, { isActive }, role, actorId);
}

/** Case-insensitive name → id lookup for imports. */
export async function vendorIdsByName(db: DbClient): Promise<Map<string, string>> {
  const rows = await db.vendor.findMany({ select: { id: true, name: true } });
  return new Map(rows.map(r => [r.name.trim().toLowerCase(), r.id]));
}
