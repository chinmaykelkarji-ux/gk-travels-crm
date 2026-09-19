// ============================================================
// Hotels master: hotel → room types → season rates per meal plan. Rates are
// commercial: cost and sell are hidden from roles without commercial access
// and only rate writers may change them. Overlapping seasons for the same
// room type and meal plan are refused (a stay must price one way).
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound, conflict } from '../../core/errors.js';
import { canSeeCommercials } from '../../lib/redact.js';
import { findRateOverlap, quoteStay, type RateRow } from '../../../../src/shared/calc/hotelRates.js';
import type { HotelInput, HotelUpdate, MasterListQuery, RateInput, RoomTypeInput } from '../../../../src/shared/contracts/masters.js';
import { assertVendor, changedKeys, dayDate, isoDay, n, page, pick } from './common.js';

const HOTEL_INCLUDE = {
  vendor: { select: { id: true, name: true } },
  roomTypes: { orderBy: { name: 'asc' }, include: { rates: { orderBy: [{ mealPlan: 'asc' }, { validFrom: 'asc' }] } } },
} satisfies Prisma.HotelInclude;
type HotelRow = Prisma.HotelGetPayload<{ include: typeof HOTEL_INCLUDE }>;
type RateRowDb = HotelRow['roomTypes'][number]['rates'][number];

function rateDto(r: RateRowDb, commercial: boolean) {
  return {
    id: r.id, mealPlan: r.mealPlan, validFrom: isoDay(r.validFrom)!, validTo: isoDay(r.validTo)!, label: r.label,
    costPerNight: commercial ? n(r.costPerNight) : null, sellPerNight: commercial ? n(r.sellPerNight) : null,
    extraAdult: commercial ? n(r.extraAdult) : null, extraChild: commercial ? n(r.extraChild) : null, gstRatePct: n(r.gstRatePct),
  };
}

function hotelDto(h: HotelRow, role: string | undefined) {
  const commercial = canSeeCommercials(role);
  return {
    id: h.id, name: h.name, city: h.city, state: h.state, category: h.category, vendor: h.vendor, vendorId: h.vendorId, address: h.address, phone: h.phone,
    email: h.email, gstin: h.gstin, checkInTime: h.checkInTime, checkOutTime: h.checkOutTime, amenities: Array.isArray(h.amenities) ? h.amenities as string[] : [],
    notes: h.notes, isActive: h.isActive, createdAt: h.createdAt.toISOString(), canSeeRates: commercial,
    roomTypes: h.roomTypes.map(rt => ({
      id: rt.id, name: rt.name, maxAdults: rt.maxAdults, maxChildren: rt.maxChildren, mealPlans: Array.isArray(rt.mealPlans) ? rt.mealPlans as string[] : [],
      notes: rt.notes, isActive: rt.isActive, rates: rt.rates.map(r => rateDto(r, commercial)),
    })),
  };
}
export type HotelDto = ReturnType<typeof hotelDto>;

export async function listHotels(q: MasterListQuery) {
  const term = q.q?.trim();
  const where: Prisma.HotelWhereInput = {
    ...(q.includeInactive ? {} : { isActive: true }),
    ...(q.city ? { city: { contains: q.city, mode: 'insensitive' } } : {}),
    ...(q.vendorId ? { vendorId: q.vendorId } : {}),
    ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { city: { contains: term, mode: 'insensitive' } }, { category: { contains: term, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.hotel.findMany({ where, orderBy: [{ city: 'asc' }, { name: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { vendor: { select: { id: true, name: true } }, _count: { select: { roomTypes: true } } } }),
    prisma.hotel.count({ where }),
  ]);
  return page(rows.map(h => ({ id: h.id, name: h.name, city: h.city, state: h.state, category: h.category, vendor: h.vendor, phone: h.phone, gstin: h.gstin, isActive: h.isActive, roomTypeCount: h._count.roomTypes })), total, q);
}

export async function getHotel(id: string, role: string | undefined) {
  const h = await prisma.hotel.findUnique({ where: { id }, include: HOTEL_INCLUDE });
  if (!h) throw notFound('Hotel');
  const activity = await prisma.activityLog.findMany({ where: { entityType: 'hotel', entityId: id }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, action: true, description: true, timestamp: true, userId: true, source: true } });
  return { ...hotelDto(h, role), activity };
}

async function assertNoDuplicateHotel(name: string, city: string, excludeId?: string) {
  const dup = await prisma.hotel.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, city: { equals: city, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
  if (dup) throw new AppError('CONFLICT', 409, `${name}, ${city} already exists`, { existingHotelId: dup.id });
}

export async function createHotel(input: HotelInput, role: string | undefined, actorId?: string | null) {
  await assertVendor(prisma, input.vendorId);
  await assertNoDuplicateHotel(input.name, input.city);
  const h = await prisma.$transaction(async tx => {
    const created = await tx.hotel.create({ data: { ...input, amenities: input.amenities as Prisma.InputJsonValue, createdById: actorId ?? null }, include: HOTEL_INCLUDE });
    await audit(tx, { action: 'hotel_created', entityType: 'hotel', entityId: created.id, userId: actorId, description: `Hotel ${created.name}, ${created.city} added`, after: { name: created.name, city: created.city, category: created.category } });
    return created;
  });
  return hotelDto(h, role);
}

const HOTEL_AUDITED = ['name', 'city', 'state', 'category', 'vendorId', 'address', 'phone', 'email', 'gstin', 'checkInTime', 'checkOutTime', 'amenities', 'notes', 'isActive'];

export async function updateHotel(id: string, input: HotelUpdate, role: string | undefined, actorId?: string | null) {
  const before = await prisma.hotel.findUnique({ where: { id } });
  if (!before) throw notFound('Hotel');
  if (input.vendorId) await assertVendor(prisma, input.vendorId);
  if (input.name !== undefined || input.city !== undefined) await assertNoDuplicateHotel(input.name ?? before.name, input.city ?? before.city, id);
  const { amenities, ...rest } = input;
  const h = await prisma.$transaction(async tx => {
    const a = await tx.hotel.update({ where: { id }, data: { ...rest, ...(amenities ? { amenities: amenities as Prisma.InputJsonValue } : {}) }, include: HOTEL_INCLUDE });
    const keys = changedKeys(before as unknown as Record<string, unknown>, a as unknown as Record<string, unknown>, HOTEL_AUDITED);
    await audit(tx, { action: 'hotel_updated', entityType: 'hotel', entityId: id, userId: actorId, description: `Hotel ${a.name} updated (${keys.join(', ') || 'no changes'})`, before: pick(before as unknown as Record<string, unknown>, keys), after: pick(a as unknown as Record<string, unknown>, keys) });
    return a;
  });
  return hotelDto(h, role);
}

// ── Room types ────────────────────────────────────────────────

export async function addRoomType(hotelId: string, input: RoomTypeInput, role: string | undefined, actorId?: string | null) {
  const h = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true } });
  if (!h) throw notFound('Hotel');
  if (await prisma.hotelRoomType.findFirst({ where: { hotelId, name: { equals: input.name, mode: 'insensitive' } } })) throw conflict(`${h.name} already has a "${input.name}" room type`);
  await prisma.$transaction(async tx => {
    const rt = await tx.hotelRoomType.create({ data: { ...input, hotelId, mealPlans: input.mealPlans as Prisma.InputJsonValue } });
    await audit(tx, { action: 'hotel_room_type_added', entityType: 'hotel', entityId: hotelId, userId: actorId, description: `Room type ${rt.name} added to ${h.name}`, after: { roomTypeId: rt.id, name: rt.name, mealPlans: input.mealPlans } });
  });
  return getHotel(hotelId, role);
}

export async function updateRoomType(roomTypeId: string, input: Partial<RoomTypeInput>, role: string | undefined, actorId?: string | null) {
  const rt = await prisma.hotelRoomType.findUnique({ where: { id: roomTypeId }, include: { hotel: { select: { id: true, name: true } } } });
  if (!rt) throw notFound('Room type');
  if (input.name && input.name.toLowerCase() !== rt.name.toLowerCase() && await prisma.hotelRoomType.findFirst({ where: { hotelId: rt.hotelId, name: { equals: input.name, mode: 'insensitive' } } })) {
    throw conflict(`${rt.hotel.name} already has a "${input.name}" room type`);
  }
  const { mealPlans, ...rest } = input;
  await prisma.$transaction(async tx => {
    const a = await tx.hotelRoomType.update({ where: { id: roomTypeId }, data: { ...rest, ...(mealPlans ? { mealPlans: mealPlans as Prisma.InputJsonValue } : {}) } });
    const keys = changedKeys(rt as unknown as Record<string, unknown>, a as unknown as Record<string, unknown>, ['name', 'maxAdults', 'maxChildren', 'mealPlans', 'notes', 'isActive']);
    await audit(tx, { action: 'hotel_room_type_updated', entityType: 'hotel', entityId: rt.hotelId, userId: actorId, description: `Room type ${a.name} at ${rt.hotel.name} updated (${keys.join(', ') || 'no changes'})`, before: pick(rt as unknown as Record<string, unknown>, keys), after: pick(a as unknown as Record<string, unknown>, keys) });
  });
  return getHotel(rt.hotelId, role);
}

// ── Rates ─────────────────────────────────────────────────────

async function existingRates(roomTypeId: string): Promise<RateRow[]> {
  const rows = await prisma.hotelRate.findMany({ where: { roomTypeId } });
  return rows.map(r => ({ id: r.id, mealPlan: r.mealPlan, validFrom: isoDay(r.validFrom)!, validTo: isoDay(r.validTo)!, costPerNight: Number(r.costPerNight), sellPerNight: n(r.sellPerNight) }));
}

function rateData(input: RateInput) {
  return {
    mealPlan: input.mealPlan, validFrom: dayDate(input.validFrom)!, validTo: dayDate(input.validTo)!, costPerNight: input.costPerNight,
    sellPerNight: input.sellPerNight, extraAdult: input.extraAdult, extraChild: input.extraChild, gstRatePct: input.gstRatePct, label: input.label,
  };
}

function assertNoOverlap(candidate: RateRow, rows: RateRow[]) {
  const clash = findRateOverlap(candidate, rows);
  if (clash) throw new AppError('CONFLICT', 409, `Overlaps the ${candidate.mealPlan} season ${clash.validFrom} → ${clash.validTo}`, { validFrom: 'Seasons for the same meal plan must not overlap' });
}

export async function addRate(roomTypeId: string, input: RateInput, role: string | undefined, actorId?: string | null) {
  const rt = await prisma.hotelRoomType.findUnique({ where: { id: roomTypeId }, include: { hotel: { select: { id: true, name: true } } } });
  if (!rt) throw notFound('Room type');
  assertNoOverlap({ ...input }, await existingRates(roomTypeId));
  await prisma.$transaction(async tx => {
    const r = await tx.hotelRate.create({ data: { roomTypeId, ...rateData(input) } });
    await audit(tx, { action: 'hotel_rate_added', entityType: 'hotel', entityId: rt.hotelId, userId: actorId, description: `${rt.hotel.name} · ${rt.name} ${input.mealPlan} ${input.validFrom} → ${input.validTo}: cost ₹${input.costPerNight}/night`, after: { rateId: r.id, ...input } });
  });
  return getHotel(rt.hotelId, role);
}

export async function updateRate(rateId: string, input: RateInput, role: string | undefined, actorId?: string | null) {
  const r = await prisma.hotelRate.findUnique({ where: { id: rateId }, include: { roomType: { include: { hotel: { select: { id: true, name: true } } } } } });
  if (!r) throw notFound('Rate');
  assertNoOverlap({ ...input, id: rateId }, await existingRates(r.roomTypeId));
  await prisma.$transaction(async tx => {
    await tx.hotelRate.update({ where: { id: rateId }, data: rateData(input) });
    await audit(tx, { action: 'hotel_rate_updated', entityType: 'hotel', entityId: r.roomType.hotelId, userId: actorId, description: `${r.roomType.hotel.name} · ${r.roomType.name} rate updated`, before: { mealPlan: r.mealPlan, validFrom: isoDay(r.validFrom), validTo: isoDay(r.validTo), costPerNight: n(r.costPerNight), sellPerNight: n(r.sellPerNight) }, after: input });
  });
  return getHotel(r.roomType.hotelId, role);
}

export async function deleteRate(rateId: string, role: string | undefined, actorId?: string | null) {
  const r = await prisma.hotelRate.findUnique({ where: { id: rateId }, include: { roomType: { include: { hotel: { select: { id: true, name: true } } } } } });
  if (!r) throw notFound('Rate');
  await prisma.$transaction(async tx => {
    await tx.hotelRate.delete({ where: { id: rateId } });
    await audit(tx, { action: 'hotel_rate_deleted', entityType: 'hotel', entityId: r.roomType.hotelId, userId: actorId, description: `${r.roomType.hotel.name} · ${r.roomType.name} ${r.mealPlan} ${isoDay(r.validFrom)} → ${isoDay(r.validTo)} removed`, before: { mealPlan: r.mealPlan, validFrom: isoDay(r.validFrom), validTo: isoDay(r.validTo), costPerNight: n(r.costPerNight), sellPerNight: n(r.sellPerNight) } });
  });
  return getHotel(r.roomType.hotelId, role);
}

/** Night-by-night price of a stay from the rate sheet (hotel-booking form). Commercial roles only. */
export async function quoteHotelStay(hotelId: string, q: { roomTypeId: string; mealPlan: string; checkIn: string; checkOut: string; rooms: number }) {
  const rt = await prisma.hotelRoomType.findFirst({ where: { id: q.roomTypeId, hotelId } });
  if (!rt) throw notFound('Room type');
  if (q.checkOut <= q.checkIn) throw new AppError('VALIDATION_ERROR', 400, 'Check-out must be after check-in', { checkOut: 'After check-in' });
  return quoteStay(await existingRates(rt.id), q.mealPlan, q.checkIn, q.checkOut, q.rooms);
}
