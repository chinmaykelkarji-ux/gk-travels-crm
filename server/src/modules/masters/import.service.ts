// ============================================================
// Master-data import from CSV (Excel sheets are converted to CSV in the
// browser). preview() validates every row with the same zod contracts the
// forms use and says what would be created or updated; commit() re-runs the
// whole validation on the server (the preview is never trusted), then writes
// all accepted rows in one transaction with one audit row per record.
// Rows with errors block the commit unless the user chose to skip them.
// ============================================================

import type { Prisma } from '@prisma/client';
import { ZodError, type ZodTypeAny } from 'zod';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { auditMany, audit, type AuditInput } from '../../core/audit.js';
import { AppError } from '../../core/errors.js';
import { parseCsv } from '../../../../src/shared/calc/csv.js';
import { mapHeaders, mapRow, type ImportKind } from '../../../../src/shared/calc/importMapping.js';
import { findRateOverlap, type RateRow } from '../../../../src/shared/calc/hotelRates.js';
import { normalizePhone } from '../../../../src/shared/calc/phone.js';
import {
  ActivityInput, DriverInput, HotelInput, IMPORT_MAX_ROWS, RateInput, VehicleInput, VendorInput,
  type ImportPreview, type ImportRowResult, type ImportRowStatus,
} from '../../../../src/shared/contracts/masters.js';
import { canSeeCommercials } from '../../lib/redact.js';
import { nextVendorId, vendorCreateData, vendorIdsByName } from './vendors.service.js';
import { vehicleData, driverData } from './fleet.service.js';
import { dayDate, isoDay, n } from './common.js';

const SCHEMA: Record<ImportKind, ZodTypeAny> = {
  vendors: VendorInput, hotels: HotelInput, 'hotel-rates': RateInput, vehicles: VehicleInput, drivers: DriverInput, activities: ActivityInput,
};

interface Planned extends ImportRowResult { apply?: (tx: DbClient) => Promise<AuditInput> }

const key = (...parts: (string | null | undefined)[]) => parts.map(p => (p ?? '').trim().toLowerCase()).join('|');

function zodErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[i.path.join('.') || '_'] = i.message;
  return out;
}

/** Resolves "vendorName" to vendorId; returns an error message when the vendor is unknown. */
function resolveVendor(data: Record<string, unknown>, vendors: Map<string, string>): string | null {
  const name = typeof data.vendorName === 'string' ? data.vendorName : null;
  delete data.vendorName;
  if (!name) return null;
  const id = vendors.get(name.trim().toLowerCase());
  if (!id) return `Vendor "${name}" not found — add it (or import vendors) first`;
  data.vendorId = id;
  return null;
}

// ── Planning per kind ─────────────────────────────────────────

async function plan(kind: ImportKind, csv: string, role: string | undefined, actorId: string | null | undefined): Promise<{ preview: ImportPreview; planned: Planned[] }> {
  const parsed = parseCsv(csv);
  const mapping = mapHeaders(kind, parsed.headers);
  const fileErrors = [...parsed.errors];
  if (parsed.rows.length > IMPORT_MAX_ROWS) fileErrors.push(`The file has ${parsed.rows.length} rows; the limit is ${IMPORT_MAX_ROWS}. Split it into smaller files.`);
  if (mapping.missingRequired.length) fileErrors.push(`Missing required column(s): ${mapping.missingRequired.join(', ')}`);

  const planned: Planned[] = [];
  if (!mapping.missingRequired.length && parsed.rows.length <= IMPORT_MAX_ROWS) {
    const vendors = await vendorIdsByName(prisma);
    const ctx = await loadContext(kind);
    const seen = new Map<string, number>();
    parsed.rows.forEach((row, i) => {
      const line = i + 2; // header is line 1
      const data = mapRow(kind, row, mapping);
      const errors: Record<string, string> = {};
      if (kind !== 'vendors' && kind !== 'hotel-rates') { const e = resolveVendor(data, vendors); if (e) errors.vendorName = e; }
      const result = SCHEMA[kind].safeParse(kind === 'hotel-rates' ? { ...data, mealPlan: String(data.mealPlan ?? '').toUpperCase() } : data);
      if (!result.success) Object.assign(errors, zodErrors(result.error));
      planned.push(planRow(kind, line, result.success ? { ...data, ...result.data } : data, errors, ctx, seen, role, actorId));
    });
  }
  const counts: Record<ImportRowStatus, number> = { create: 0, update: 0, error: 0, skip: 0 };
  for (const p of planned) counts[p.status]++;
  const preview: ImportPreview = {
    kind, totalRows: parsed.rows.length, unknownHeaders: mapping.unknownHeaders, missingColumns: mapping.missingRequired, counts, fileErrors,
    rows: planned.map(({ apply: _a, ...r }) => r),
  };
  return { preview, planned };
}

interface Ctx {
  vendorsByPhone?: Map<string, { id: string; name: string }>;
  vendorsByName?: Map<string, string>;
  hotels?: Map<string, { id: string; claimed?: boolean; roomTypes: Map<string, { id: string; claimed?: boolean; rates: RateRow[] }> }>;
  vehicles?: Map<string, string>;
  drivers?: Map<string, string>;
  activities?: Map<string, string>;
}

async function loadContext(kind: ImportKind): Promise<Ctx> {
  switch (kind) {
    case 'vendors': {
      const rows = await prisma.vendor.findMany({ select: { id: true, name: true, phoneNormalized: true } });
      return { vendorsByPhone: new Map(rows.filter(r => r.phoneNormalized).map(r => [r.phoneNormalized!, { id: r.id, name: r.name }])), vendorsByName: new Map(rows.map(r => [key(r.name), r.id])) };
    }
    case 'hotels':
    case 'hotel-rates': {
      const rows = await prisma.hotel.findMany({ select: { id: true, name: true, city: true, roomTypes: { select: { id: true, name: true, rates: true } } } });
      return { hotels: new Map(rows.map(h => [key(h.name, h.city), { id: h.id, roomTypes: new Map(h.roomTypes.map(rt => [key(rt.name), { id: rt.id, rates: rt.rates.map(r => ({ id: r.id, mealPlan: r.mealPlan, validFrom: isoDay(r.validFrom)!, validTo: isoDay(r.validTo)!, costPerNight: Number(r.costPerNight), sellPerNight: n(r.sellPerNight) })) }])) }])) };
    }
    case 'vehicles': {
      const rows = await prisma.vehicle.findMany({ select: { id: true, registrationNo: true } });
      return { vehicles: new Map(rows.map(v => [key(v.registrationNo), v.id])) };
    }
    case 'drivers': {
      const rows = await prisma.driver.findMany({ select: { id: true, phoneNormalized: true } });
      return { drivers: new Map(rows.filter(d => d.phoneNormalized).map(d => [d.phoneNormalized!, d.id])) };
    }
    case 'activities': {
      const rows = await prisma.activity.findMany({ select: { id: true, name: true, city: true } });
      return { activities: new Map(rows.map(a => [key(a.name, a.city), a.id])) };
    }
  }
}

function planRow(kind: ImportKind, line: number, data: Record<string, unknown>, errors: Record<string, string>, ctx: Ctx, seen: Map<string, number>, role: string | undefined, actorId: string | null | undefined): Planned {
  const base = { line, errors, data, matchId: null as string | null };
  const fail = (label: string): Planned => ({ ...base, status: 'error', label });
  const dupInFile = (k: string, label: string): Planned | null => {
    const first = seen.get(k);
    if (first) { errors._ = `Same record as line ${first}`; return { ...base, status: 'error', label }; }
    seen.set(k, line);
    return null;
  };

  switch (kind) {
    case 'vendors': {
      const label = String(data.name ?? `Line ${line}`);
      if (Object.keys(errors).length) return fail(label);
      const d = data as VendorInput;
      const byPhone = ctx.vendorsByPhone!.get(normalizePhone(d.phone) ?? '');
      const dup = dupInFile(normalizePhone(d.phone) ?? key(d.name), label); if (dup) return dup;
      const matchId = byPhone?.id ?? ctx.vendorsByName!.get(key(d.name)) ?? null;
      const { force: _f, bankDetails: _b, ...fields } = d;
      if (matchId) {
        return { ...base, matchId, status: 'update', label, apply: async tx => { await tx.vendor.update({ where: { id: matchId }, data: { ...fields, destinations: fields.destinations as Prisma.InputJsonValue, phoneNormalized: normalizePhone(d.phone) } }); return { action: 'vendor_updated', entityType: 'vendor', entityId: matchId, userId: actorId, description: `Vendor ${d.name} updated by import`, after: { name: d.name, kind: d.kind, phone: d.phone } }; } };
      }
      return { ...base, status: 'create', label, apply: async tx => { const id = await nextVendorId(tx); await tx.vendor.create({ data: vendorCreateData(id, { ...fields, bankDetails: undefined }, role) }); return { action: 'vendor_created', entityType: 'vendor', entityId: id, userId: actorId, description: `Vendor ${d.name} (${d.kind}) imported`, after: { name: d.name, kind: d.kind, phone: d.phone } }; } };
    }
    case 'hotels': {
      const label = `${data.name ?? '?'}, ${data.city ?? '?'}`;
      if (Object.keys(errors).length) return fail(label);
      const d = data as HotelInput;
      const k = key(d.name, d.city);
      const dup = dupInFile(k, label); if (dup) return dup;
      const matchId = ctx.hotels!.get(k)?.id ?? null;
      const fields = { ...d, amenities: d.amenities as Prisma.InputJsonValue };
      if (matchId) return { ...base, matchId, status: 'update', label, apply: async tx => { await tx.hotel.update({ where: { id: matchId }, data: fields }); return { action: 'hotel_updated', entityType: 'hotel', entityId: matchId, userId: actorId, description: `Hotel ${label} updated by import` }; } };
      return { ...base, status: 'create', label, apply: async tx => { const h = await tx.hotel.create({ data: { ...fields, createdById: actorId ?? null } }); return { action: 'hotel_created', entityType: 'hotel', entityId: h.id, userId: actorId, description: `Hotel ${label} imported` }; } };
    }
    case 'hotel-rates': {
      const hotelName = String(data.hotel ?? ''), city = String(data.city ?? ''), roomType = String(data.roomType ?? '');
      const label = `${hotelName}, ${city} · ${roomType} ${data.mealPlan ?? ''} ${data.validFrom ?? ''}→${data.validTo ?? ''}`;
      if (!canSeeCommercials(role)) errors._ = 'Your role cannot import rates';
      if (!hotelName.trim()) errors.hotel = 'Hotel name is required';
      if (!city.trim()) errors.city = 'City is required';
      if (!roomType.trim()) errors.roomType = 'Room type is required';
      if (Object.keys(errors).length) return fail(label);
      const r = data as unknown as RateInput;
      const hk = key(hotelName, city);
      let hotel = ctx.hotels!.get(hk);
      if (!hotel) { hotel = { id: '', roomTypes: new Map() }; ctx.hotels!.set(hk, hotel); }
      let rt = hotel.roomTypes.get(key(roomType));
      if (!rt) { rt = { id: '', rates: [] }; hotel.roomTypes.set(key(roomType), rt); }
      const clash = findRateOverlap({ mealPlan: r.mealPlan, validFrom: r.validFrom, validTo: r.validTo, costPerNight: r.costPerNight }, rt.rates);
      if (clash) { errors.validFrom = `Overlaps ${clash.id ? 'the existing' : 'another row\'s'} ${clash.mealPlan} season ${clash.validFrom} → ${clash.validTo}`; return fail(label); }
      rt.rates.push({ mealPlan: r.mealPlan, validFrom: r.validFrom, validTo: r.validTo, costPerNight: r.costPerNight });
      // The first accepted row for a new hotel / room type is the one that creates it.
      const createsHotel = !hotel.id && !hotel.claimed, createsRoomType = !rt.id && !rt.claimed;
      hotel.claimed = true; rt.claimed = true;
      const labelled = `${label}${createsHotel ? ' (new hotel)' : createsRoomType ? ' (new room type)' : ''}`;
      const hotelRef = hotel, rtRef = rt;
      return { ...base, status: 'create', label: labelled, apply: async tx => {
        if (!hotelRef.id) hotelRef.id = (await tx.hotel.create({ data: { name: hotelName.trim(), city: city.trim(), createdById: actorId ?? null } })).id;
        if (!rtRef.id) rtRef.id = (await tx.hotelRoomType.create({ data: { hotelId: hotelRef.id, name: roomType.trim(), mealPlans: [r.mealPlan] as Prisma.InputJsonValue } })).id;
        const created = await tx.hotelRate.create({ data: { roomTypeId: rtRef.id, mealPlan: r.mealPlan, validFrom: dayDate(r.validFrom)!, validTo: dayDate(r.validTo)!, costPerNight: r.costPerNight, sellPerNight: r.sellPerNight, extraAdult: r.extraAdult, extraChild: r.extraChild, gstRatePct: r.gstRatePct, label: r.label } });
        return { action: 'hotel_rate_added', entityType: 'hotel', entityId: hotelRef.id, userId: actorId, description: `${hotelName} · ${roomType} ${r.mealPlan} ${r.validFrom} → ${r.validTo} imported: cost ₹${r.costPerNight}/night`, after: { rateId: created.id } };
      } };
    }
    case 'vehicles': {
      const label = String(data.registrationNo ?? `Line ${line}`);
      if (Object.keys(errors).length) return fail(label);
      const d = data as VehicleInput;
      const k = key(d.registrationNo);
      const dup = dupInFile(k, label); if (dup) return dup;
      const matchId = ctx.vehicles!.get(k) ?? null;
      if (matchId) return { ...base, matchId, status: 'update', label, apply: async tx => { await tx.vehicle.update({ where: { id: matchId }, data: vehicleData(d) }); return { action: 'vehicle_updated', entityType: 'vehicle', entityId: matchId, userId: actorId, description: `Vehicle ${d.registrationNo} updated by import` }; } };
      return { ...base, status: 'create', label, apply: async tx => { const v = await tx.vehicle.create({ data: vehicleData(d) as Prisma.VehicleUncheckedCreateInput }); return { action: 'vehicle_created', entityType: 'vehicle', entityId: v.id, userId: actorId, description: `Vehicle ${d.registrationNo} (${d.type}, ${d.seats} seats) imported` }; } };
    }
    case 'drivers': {
      const label = `${data.name ?? '?'} (${data.phone ?? '?'})`;
      if (Object.keys(errors).length) return fail(label);
      const d = data as DriverInput;
      const p = normalizePhone(d.phone) ?? '';
      const dup = dupInFile(p, label); if (dup) return dup;
      const matchId = ctx.drivers!.get(p) ?? null;
      if (matchId) return { ...base, matchId, status: 'update', label, apply: async tx => { await tx.driver.update({ where: { id: matchId }, data: driverData(d) }); return { action: 'driver_updated', entityType: 'driver', entityId: matchId, userId: actorId, description: `Driver ${d.name} updated by import` }; } };
      return { ...base, status: 'create', label, apply: async tx => { const dr = await tx.driver.create({ data: driverData(d) as Prisma.DriverUncheckedCreateInput }); return { action: 'driver_created', entityType: 'driver', entityId: dr.id, userId: actorId, description: `Driver ${d.name} imported` }; } };
    }
    case 'activities': {
      const label = `${data.name ?? '?'}, ${data.city ?? '?'}`;
      if (Object.keys(errors).length) return fail(label);
      const d = data as ActivityInput;
      const fields = canSeeCommercials(role) ? d : { ...d, costAdult: null, costChild: null, sellAdult: null, sellChild: null };
      const k = key(d.name, d.city);
      const dup = dupInFile(k, label); if (dup) return dup;
      const matchId = ctx.activities!.get(k) ?? null;
      if (matchId) return { ...base, matchId, status: 'update', label, apply: async tx => { await tx.activity.update({ where: { id: matchId }, data: fields }); return { action: 'activity_master_updated', entityType: 'activity', entityId: matchId, userId: actorId, description: `Activity ${label} updated by import` }; } };
      return { ...base, status: 'create', label, apply: async tx => { const a = await tx.activity.create({ data: fields as Prisma.ActivityUncheckedCreateInput }); return { action: 'activity_master_created', entityType: 'activity', entityId: a.id, userId: actorId, description: `Activity ${label} imported` }; } };
    }
  }
}

// ── Public API ────────────────────────────────────────────────

export async function previewImport(kind: ImportKind, csv: string, role: string | undefined) {
  return (await plan(kind, csv, role, null)).preview;
}

export async function commitImport(kind: ImportKind, csv: string, skipInvalid: boolean, role: string | undefined, actorId?: string | null) {
  const { preview, planned } = await plan(kind, csv, role, actorId);
  if (preview.fileErrors.length) throw new AppError('VALIDATION_ERROR', 400, preview.fileErrors[0], { file: preview.fileErrors.join('; ') });
  if (preview.counts.error && !skipInvalid) throw new AppError('VALIDATION_ERROR', 400, `${preview.counts.error} row(s) have errors. Fix them or choose to skip them.`, { rows: preview.rows.filter(r => r.status === 'error').map(r => `line ${r.line}`).join(', ') });
  const todo = planned.filter(p => p.apply);
  if (!todo.length) throw new AppError('VALIDATION_ERROR', 400, 'Nothing to import');
  const audits = await prisma.$transaction(async tx => {
    const rows: AuditInput[] = [];
    for (const p of todo) rows.push(await p.apply!(tx));
    await auditMany(tx, rows);
    await audit(tx, { action: 'masters_imported', entityType: 'import', entityId: kind, userId: actorId, description: `Imported ${kind}: ${preview.counts.create} created, ${preview.counts.update} updated, ${preview.counts.error} skipped`, metadata: { kind, counts: preview.counts, skippedLines: preview.rows.filter(r => r.status === 'error').map(r => r.line) } });
    return rows;
  }, { timeout: 120_000, maxWait: 10_000 });
  return { ...preview, committed: audits.length };
}
