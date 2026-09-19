// ============================================================
// Fleet master: vehicles (own or vendor-owned, with insurance / permit /
// fitness / PUC expiries) and drivers (licence expiry, languages, optional
// app login for the driver view). Compliance is computed, never stored.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound } from '../../core/errors.js';
import { normalizePhone } from '../../../../src/shared/calc/phone.js';
import { complianceReport } from '../../../../src/shared/calc/compliance.js';
import { COMPLIANCE_WARN_DAYS, type DriverInput, type DriverUpdate, type MasterListQuery, type VehicleInput, type VehicleUpdate } from '../../../../src/shared/contracts/masters.js';
import { assertVendor, changedKeys, dayDate, isoDay, page, pick, today } from './common.js';

// ── Vehicles ──────────────────────────────────────────────────

const VEHICLE_INCLUDE = { vendor: { select: { id: true, name: true } }, defaultDriver: { select: { id: true, name: true, phone: true } } } as const;
type VehicleRow = Prisma.VehicleGetPayload<{ include: typeof VEHICLE_INCLUDE }>;

export function vehicleDocs(v: { insuranceExpiry: Date | null; permitExpiry: Date | null; fitnessExpiry: Date | null; pucExpiry: Date | null }) {
  return { insurance: isoDay(v.insuranceExpiry), permit: isoDay(v.permitExpiry), fitness: isoDay(v.fitnessExpiry), puc: isoDay(v.pucExpiry) };
}

function vehicleDto(v: VehicleRow) {
  return {
    id: v.id, registrationNo: v.registrationNo, type: v.type, make: v.make, model: v.model, seats: v.seats, ownership: v.ownership,
    vendorId: v.vendorId, vendor: v.vendor, defaultDriverId: v.defaultDriverId, defaultDriver: v.defaultDriver,
    insuranceExpiry: isoDay(v.insuranceExpiry), permitExpiry: isoDay(v.permitExpiry), fitnessExpiry: isoDay(v.fitnessExpiry), pucExpiry: isoDay(v.pucExpiry),
    compliance: complianceReport(vehicleDocs(v), today(), COMPLIANCE_WARN_DAYS), notes: v.notes, isActive: v.isActive, createdAt: v.createdAt.toISOString(),
  };
}
export type VehicleDto = ReturnType<typeof vehicleDto>;

export async function listVehicles(q: MasterListQuery) {
  const term = q.q?.trim();
  const where: Prisma.VehicleWhereInput = {
    ...(q.includeInactive ? {} : { isActive: true }),
    ...(q.vendorId ? { vendorId: q.vendorId } : {}),
    ...(term ? { OR: [{ registrationNo: { contains: term.replace(/[\s-]+/g, ' '), mode: 'insensitive' } }, { type: { contains: term, mode: 'insensitive' } }, { make: { contains: term, mode: 'insensitive' } }, { model: { contains: term, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.vehicle.findMany({ where, orderBy: [{ isActive: 'desc' }, { registrationNo: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: VEHICLE_INCLUDE }),
    prisma.vehicle.count({ where }),
  ]);
  return page(rows.map(vehicleDto), total, q);
}

export async function getVehicle(id: string) {
  const v = await prisma.vehicle.findUnique({ where: { id }, include: VEHICLE_INCLUDE });
  if (!v) throw notFound('Vehicle');
  const activity = await prisma.activityLog.findMany({ where: { entityType: 'vehicle', entityId: id }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, action: true, description: true, timestamp: true, userId: true, source: true } });
  return { ...vehicleDto(v), activity };
}

async function assertDriver(driverId: string | null | undefined) {
  if (!driverId) return;
  if (!(await prisma.driver.findUnique({ where: { id: driverId }, select: { id: true } }))) throw new AppError('VALIDATION_ERROR', 400, 'Driver not found', { defaultDriverId: 'Unknown driver' });
}

async function assertUniqueRegistration(registrationNo: string, excludeId?: string) {
  const dup = await prisma.vehicle.findFirst({ where: { registrationNo: { equals: registrationNo, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
  if (dup) throw new AppError('CONFLICT', 409, `Vehicle ${registrationNo} is already on file`, { existingVehicleId: dup.id });
}

export function vehicleData(input: Partial<VehicleInput>): Prisma.VehicleUncheckedUpdateInput {
  const { insuranceExpiry, permitExpiry, fitnessExpiry, pucExpiry, ...rest } = input;
  return {
    ...rest,
    ...(insuranceExpiry !== undefined ? { insuranceExpiry: dayDate(insuranceExpiry) } : {}),
    ...(permitExpiry !== undefined ? { permitExpiry: dayDate(permitExpiry) } : {}),
    ...(fitnessExpiry !== undefined ? { fitnessExpiry: dayDate(fitnessExpiry) } : {}),
    ...(pucExpiry !== undefined ? { pucExpiry: dayDate(pucExpiry) } : {}),
  };
}

export async function createVehicle(input: VehicleInput, actorId?: string | null) {
  await assertVendor(prisma, input.vendorId);
  await assertDriver(input.defaultDriverId);
  await assertUniqueRegistration(input.registrationNo);
  const v = await prisma.$transaction(async tx => {
    const created = await tx.vehicle.create({ data: vehicleData(input) as Prisma.VehicleUncheckedCreateInput, include: VEHICLE_INCLUDE });
    await audit(tx, { action: 'vehicle_created', entityType: 'vehicle', entityId: created.id, userId: actorId, description: `Vehicle ${created.registrationNo} (${created.type}, ${created.seats} seats) added`, after: { registrationNo: created.registrationNo, type: created.type, seats: created.seats, ownership: created.ownership, vendorId: created.vendorId } });
    return created;
  });
  return vehicleDto(v);
}

const VEHICLE_AUDITED = ['registrationNo', 'type', 'make', 'model', 'seats', 'ownership', 'vendorId', 'defaultDriverId', 'insuranceExpiry', 'permitExpiry', 'fitnessExpiry', 'pucExpiry', 'notes', 'isActive'];

export async function updateVehicle(id: string, input: VehicleUpdate, actorId?: string | null) {
  const before = await prisma.vehicle.findUnique({ where: { id } });
  if (!before) throw notFound('Vehicle');
  if (input.vendorId) await assertVendor(prisma, input.vendorId);
  if (input.defaultDriverId) await assertDriver(input.defaultDriverId);
  if (input.registrationNo) await assertUniqueRegistration(input.registrationNo, id);
  const ownership = input.ownership ?? before.ownership;
  const vendorId = input.vendorId !== undefined ? input.vendorId : before.vendorId;
  if (ownership === 'VENDOR' && !vendorId) throw new AppError('VALIDATION_ERROR', 400, 'Choose the vendor who owns this vehicle', { vendorId: 'Required for vendor vehicles' });
  const v = await prisma.$transaction(async tx => {
    const a = await tx.vehicle.update({ where: { id }, data: vehicleData(input), include: VEHICLE_INCLUDE });
    const keys = changedKeys(before as unknown as Record<string, unknown>, a as unknown as Record<string, unknown>, VEHICLE_AUDITED);
    await audit(tx, { action: 'vehicle_updated', entityType: 'vehicle', entityId: id, userId: actorId, description: `Vehicle ${a.registrationNo} updated (${keys.join(', ') || 'no changes'})`, before: pick(before as unknown as Record<string, unknown>, keys), after: pick(a as unknown as Record<string, unknown>, keys) });
    return a;
  });
  return vehicleDto(v);
}

// ── Drivers ───────────────────────────────────────────────────

const DRIVER_INCLUDE = { vendor: { select: { id: true, name: true } }, user: { select: { id: true, email: true, isActive: true } } } as const;
type DriverRow = Prisma.DriverGetPayload<{ include: typeof DRIVER_INCLUDE }>;

function driverDto(d: DriverRow) {
  return {
    id: d.id, name: d.name, phone: d.phone, altPhone: d.altPhone, vendorId: d.vendorId, vendor: d.vendor,
    licenceNo: d.licenceNo, licenceExpiry: isoDay(d.licenceExpiry), languages: Array.isArray(d.languages) ? d.languages as string[] : [],
    address: d.address, emergencyContact: d.emergencyContact, notes: d.notes, isActive: d.isActive,
    appAccess: d.user ? { userId: d.user.id, email: d.user.email, isActive: d.user.isActive } : null,
    compliance: complianceReport({ licence: isoDay(d.licenceExpiry) }, today(), COMPLIANCE_WARN_DAYS), createdAt: d.createdAt.toISOString(),
  };
}
export type DriverDto = ReturnType<typeof driverDto>;

export async function listDrivers(q: MasterListQuery) {
  const term = q.q?.trim();
  const digits = term ? normalizePhone(term) : null;
  const where: Prisma.DriverWhereInput = {
    ...(q.includeInactive ? {} : { isActive: true }),
    ...(q.vendorId ? { vendorId: q.vendorId } : {}),
    ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { licenceNo: { contains: term, mode: 'insensitive' } }, ...(digits && digits.length >= 4 ? [{ phoneNormalized: { contains: digits } }] : [])] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.driver.findMany({ where, orderBy: [{ isActive: 'desc' }, { name: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: DRIVER_INCLUDE }),
    prisma.driver.count({ where }),
  ]);
  return page(rows.map(driverDto), total, q);
}

export async function getDriver(id: string) {
  const d = await prisma.driver.findUnique({ where: { id }, include: DRIVER_INCLUDE });
  if (!d) throw notFound('Driver');
  const activity = await prisma.activityLog.findMany({ where: { entityType: 'driver', entityId: id }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, action: true, description: true, timestamp: true, userId: true, source: true } });
  return { ...driverDto(d), activity };
}

export function driverData(input: Partial<DriverInput>): Prisma.DriverUncheckedUpdateInput {
  const { force: _f, licenceExpiry, languages, phone, ...rest } = input;
  return {
    ...rest,
    ...(phone !== undefined ? { phone, phoneNormalized: normalizePhone(phone) } : {}),
    ...(licenceExpiry !== undefined ? { licenceExpiry: dayDate(licenceExpiry) } : {}),
    ...(languages !== undefined ? { languages: languages as Prisma.InputJsonValue } : {}),
  };
}

async function findDriverByPhone(phone: string, excludeId?: string) {
  const p = normalizePhone(phone);
  if (!p) return null;
  return prisma.driver.findFirst({ where: { phoneNormalized: p, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true, name: true } });
}

export async function createDriver(input: DriverInput, actorId?: string | null) {
  await assertVendor(prisma, input.vendorId);
  if (!input.force) {
    const dup = await findDriverByPhone(input.phone);
    if (dup) throw new AppError('CONFLICT', 409, `${dup.name} already has this phone number`, { existingDriverId: dup.id });
  }
  const d = await prisma.$transaction(async tx => {
    const created = await tx.driver.create({ data: driverData(input) as Prisma.DriverUncheckedCreateInput, include: DRIVER_INCLUDE });
    await audit(tx, { action: 'driver_created', entityType: 'driver', entityId: created.id, userId: actorId, description: `Driver ${created.name} (${created.phone}) added`, after: { name: created.name, phone: created.phone, vendorId: created.vendorId, licenceExpiry: isoDay(created.licenceExpiry) } });
    return created;
  });
  return driverDto(d);
}

const DRIVER_AUDITED = ['name', 'phone', 'altPhone', 'vendorId', 'licenceNo', 'licenceExpiry', 'languages', 'address', 'emergencyContact', 'notes', 'isActive'];

export async function updateDriver(id: string, input: DriverUpdate, actorId?: string | null) {
  const before = await prisma.driver.findUnique({ where: { id } });
  if (!before) throw notFound('Driver');
  if (input.vendorId) await assertVendor(prisma, input.vendorId);
  if (input.phone) {
    const dup = await findDriverByPhone(input.phone, id);
    if (dup) throw new AppError('CONFLICT', 409, `${dup.name} already has this phone number`, { existingDriverId: dup.id });
  }
  const d = await prisma.$transaction(async tx => {
    const a = await tx.driver.update({ where: { id }, data: driverData(input), include: DRIVER_INCLUDE });
    const keys = changedKeys(before as unknown as Record<string, unknown>, a as unknown as Record<string, unknown>, DRIVER_AUDITED);
    await audit(tx, { action: 'driver_updated', entityType: 'driver', entityId: id, userId: actorId, description: `Driver ${a.name} updated (${keys.join(', ') || 'no changes'})`, before: pick(before as unknown as Record<string, unknown>, keys), after: pick(a as unknown as Record<string, unknown>, keys) });
    return a;
  });
  return driverDto(d);
}

// ── Compliance board ──────────────────────────────────────────

/** Active vehicles and drivers with a document expired, expiring within the warning window, or missing. */
export async function complianceBoard() {
  const [vehicles, drivers] = await Promise.all([
    prisma.vehicle.findMany({ where: { isActive: true }, include: VEHICLE_INCLUDE, orderBy: { registrationNo: 'asc' } }),
    prisma.driver.findMany({ where: { isActive: true }, include: DRIVER_INCLUDE, orderBy: { name: 'asc' } }),
  ]);
  return {
    vehicles: vehicles.map(vehicleDto).filter(v => v.compliance.state !== 'OK'),
    drivers: drivers.map(driverDto).filter(d => d.compliance.state !== 'OK'),
    warnDays: COMPLIANCE_WARN_DAYS,
  };
}
