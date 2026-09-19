// ============================================================
// Hotel bookings of a trip: which hotel, room type, meal plan, dates, rooms,
// guests; supplier and confirmation number; cost and sell (commercial roles
// only). Priced from the hotel's rate sheet when no amount is given.
// Changing the stay after confirmation sends it back for re-confirmation.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { canSeeCommercials } from '../../lib/redact.js';
import { canTransition, needsReconfirmation, nightsBetween, OPS_TRANSITIONS, RECONFIRM_FIELDS } from '../../../../src/shared/calc/operations.js';
import { quoteStay } from '../../../../src/shared/calc/hotelRates.js';
import type { HotelBookingInput, HotelBookingUpdate, OpsStatusChange } from '../../../../src/shared/contracts/operations.js';
import { assertOpenTrip, assertContractOnTrip, stripCommercials, money, isoDay, dayDate, n } from './common.js';
import { tripChanged } from './hooks.js';

const INCLUDE = { hotel: { select: { id: true, name: true, city: true, phone: true, address: true } }, vendor: { select: { id: true, name: true, phone: true } } } satisfies Prisma.HotelBookingInclude;
type Row = Prisma.HotelBookingGetPayload<{ include: typeof INCLUDE }>;

export function hotelBookingDto(b: Row, role: string | undefined) {
  return {
    id: b.id, tripId: b.tripId, contractId: b.contractId, hotelId: b.hotelId, hotel: b.hotel, hotelName: b.hotelName, city: b.city,
    roomTypeId: b.roomTypeId, roomTypeName: b.roomTypeName, mealPlan: b.mealPlan, checkIn: isoDay(b.checkIn)!, checkOut: isoDay(b.checkOut)!,
    nights: nightsBetween(isoDay(b.checkIn)!, isoDay(b.checkOut)!), rooms: b.rooms, adults: b.adults, children: b.children,
    travellerIds: Array.isArray(b.travellerIds) ? b.travellerIds as string[] : [], status: b.status, confirmationNo: b.confirmationNo,
    vendorId: b.vendorId, vendor: b.vendor, ...money(role, b.costAmount, b.sellAmount), customerNotes: b.customerNotes, internalNotes: b.internalNotes,
    confirmedAt: b.confirmedAt?.toISOString() ?? null, cancelledAt: b.cancelledAt?.toISOString() ?? null, cancelReason: b.cancelReason,
    legacyBookingId: b.legacyBookingId, createdAt: b.createdAt.toISOString(),
  };
}
export type HotelBookingDto = ReturnType<typeof hotelBookingDto>;

export async function listHotelBookings(tripId: string, role: string | undefined) {
  const rows = await prisma.hotelBooking.findMany({ where: { tripId }, orderBy: [{ checkIn: 'asc' }, { createdAt: 'asc' }], include: INCLUDE });
  return rows.map(r => hotelBookingDto(r, role));
}

/** Hotel/room-type snapshots and the default supplier from the masters. On create an absent vendor arrives as null (zod); on update only an explicit value counts. */
async function resolveHotel(db: DbClient, input: Partial<HotelBookingInput>, isCreate: boolean) {
  const out: Record<string, unknown> = {};
  if (input.hotelId) {
    const h = await db.hotel.findUnique({ where: { id: input.hotelId }, select: { id: true, name: true, city: true, vendorId: true } });
    if (!h) throw new AppError('VALIDATION_ERROR', 400, 'Hotel not found', { hotelId: 'Unknown hotel' });
    out.hotelName = input.hotelName || h.name;
    out.city = input.city ?? h.city;
    if ((isCreate ? !input.vendorId : input.vendorId === undefined) && h.vendorId) out.vendorId = h.vendorId;
  }
  if (input.roomTypeId) {
    const rt = await db.hotelRoomType.findUnique({ where: { id: input.roomTypeId }, select: { hotelId: true, name: true } });
    if (!rt || (input.hotelId && rt.hotelId !== input.hotelId)) throw new AppError('VALIDATION_ERROR', 400, 'Room type does not belong to this hotel', { roomTypeId: 'Choose a room type of this hotel' });
    out.roomTypeName = input.roomTypeName || rt.name;
  }
  if (input.vendorId) {
    if (!(await db.vendor.findUnique({ where: { id: input.vendorId }, select: { id: true } }))) throw new AppError('VALIDATION_ERROR', 400, 'Vendor not found', { vendorId: 'Unknown vendor' });
  }
  return out;
}

/** Cost/sell from the rate sheet when the user left them at 0 (commercial roles only). */
async function autoPrice(db: DbClient, input: { roomTypeId?: string | null; mealPlan?: string | null; checkIn: string; checkOut: string; rooms: number; costAmount?: number; sellAmount?: number }, role: string | undefined) {
  if (!canSeeCommercials(role) || !input.roomTypeId || !input.mealPlan) return { priced: {}, missingDates: [] as string[] };
  if ((input.costAmount ?? 0) > 0 || (input.sellAmount ?? 0) > 0) return { priced: {}, missingDates: [] };
  const rates = await db.hotelRate.findMany({ where: { roomTypeId: input.roomTypeId } });
  const q = quoteStay(rates.map(r => ({ id: r.id, mealPlan: r.mealPlan, validFrom: isoDay(r.validFrom)!, validTo: isoDay(r.validTo)!, costPerNight: Number(r.costPerNight), sellPerNight: n(r.sellPerNight) })), input.mealPlan, input.checkIn, input.checkOut, input.rooms);
  return { priced: { costAmount: q.costTotal, ...(q.sellTotal !== null ? { sellAmount: q.sellTotal } : {}) }, missingDates: q.missingDates };
}

export async function createHotelBooking(tripId: string, input: HotelBookingInput, role: string | undefined, actorId?: string | null) {
  await assertOpenTrip(prisma, tripId);
  await assertContractOnTrip(prisma, tripId, input.contractId);
  const snap = await resolveHotel(prisma, input, true);
  const clean = stripCommercials(input, role);
  const { priced, missingDates } = await autoPrice(prisma, input, role);
  const row = await prisma.$transaction(async tx => {
    const b = await tx.hotelBooking.create({
      data: {
        ...clean, ...snap, ...priced, tripId, hotelName: (snap.hotelName as string | undefined) ?? input.hotelName!, checkIn: dayDate(input.checkIn)!, checkOut: dayDate(input.checkOut)!,
        travellerIds: input.travellerIds as Prisma.InputJsonValue, status: 'REQUESTED', requestedAt: new Date(), createdById: actorId ?? null,
      } as Prisma.HotelBookingUncheckedCreateInput,
      include: INCLUDE,
    });
    await audit(tx, { action: 'hotel_booking_created', entityType: 'trip', entityId: tripId, userId: actorId, description: `Hotel ${b.hotelName} ${input.checkIn} → ${input.checkOut}, ${b.rooms} room(s) requested`, after: { hotelBookingId: b.id, hotelName: b.hotelName, checkIn: input.checkIn, checkOut: input.checkOut, rooms: b.rooms } });
    await tripChanged(tx, tripId, 'hotel_booking_created', actorId);
    return b;
  });
  return { ...hotelBookingDto(row, role), rateGaps: missingDates };
}

export async function updateHotelBooking(id: string, patch: HotelBookingUpdate, role: string | undefined, actorId?: string | null) {
  const before = await prisma.hotelBooking.findUnique({ where: { id } });
  if (!before) throw notFound('Hotel booking');
  await assertOpenTrip(prisma, before.tripId);
  if (patch.contractId !== undefined) await assertContractOnTrip(prisma, before.tripId, patch.contractId);
  const checkIn = patch.checkIn ?? isoDay(before.checkIn)!;
  const checkOut = patch.checkOut ?? isoDay(before.checkOut)!;
  if (checkOut <= checkIn) throw new AppError('VALIDATION_ERROR', 400, 'Check-out must be after check-in', { checkOut: 'After check-in' });
  const snap = await resolveHotel(prisma, { ...patch, hotelId: patch.hotelId ?? undefined }, false);
  const clean = stripCommercials(patch, role);
  const cmp = { ...before, checkIn: isoDay(before.checkIn), checkOut: isoDay(before.checkOut) } as Record<string, unknown>;
  const reconfirm = before.status === 'CONFIRMED' ? needsReconfirmation(cmp, { ...clean, ...snap }, RECONFIRM_FIELDS.hotel) : [];
  const row = await prisma.$transaction(async tx => {
    const a = await tx.hotelBooking.update({
      where: { id },
      data: {
        ...clean, ...snap,
        ...(patch.checkIn ? { checkIn: dayDate(patch.checkIn)! } : {}), ...(patch.checkOut ? { checkOut: dayDate(patch.checkOut)! } : {}),
        ...(patch.travellerIds ? { travellerIds: patch.travellerIds as Prisma.InputJsonValue } : {}),
        ...(reconfirm.length ? { status: 'REQUESTED', confirmedAt: null } : {}),
      } as Prisma.HotelBookingUncheckedUpdateInput,
      include: INCLUDE,
    });
    await audit(tx, {
      action: 'hotel_booking_updated', entityType: 'trip', entityId: before.tripId, userId: actorId,
      description: `Hotel ${a.hotelName} updated${reconfirm.length ? ` — ${reconfirm.join(', ')} changed, needs re-confirmation` : ''}`,
      before: { hotelBookingId: id, status: before.status, checkIn: isoDay(before.checkIn), checkOut: isoDay(before.checkOut), rooms: before.rooms }, after: { status: a.status, checkIn, checkOut, rooms: a.rooms },
    });
    await tripChanged(tx, before.tripId, 'hotel_booking_updated', actorId);
    return a;
  });
  return hotelBookingDto(row, role);
}

export async function setHotelBookingStatus(id: string, change: OpsStatusChange, role: string | undefined, actorId?: string | null) {
  const b = await prisma.hotelBooking.findUnique({ where: { id } });
  if (!b) throw notFound('Hotel booking');
  await assertOpenTrip(prisma, b.tripId);
  if (!canTransition(OPS_TRANSITIONS, b.status, change.status)) throw stateConflict(`A ${b.status.toLowerCase().replace('_', ' ')} booking cannot become ${change.status.toLowerCase().replace('_', ' ')}`);
  const confirmationNo = change.confirmationNo ?? b.confirmationNo;
  if (change.status === 'CONFIRMED' && !confirmationNo) throw new AppError('VALIDATION_ERROR', 400, 'Enter the hotel confirmation number (or who confirmed it)', { confirmationNo: 'Required to confirm' });
  if (change.status === 'CANCELLED' && !change.reason) throw new AppError('VALIDATION_ERROR', 400, 'Give a reason for cancelling', { reason: 'Required' });
  const row = await prisma.$transaction(async tx => {
    const a = await tx.hotelBooking.update({
      where: { id },
      data: {
        status: change.status, confirmationNo,
        ...(change.status === 'CONFIRMED' ? { confirmedAt: new Date(), confirmedById: actorId ?? null } : {}),
        ...(change.status === 'CANCELLED' ? { cancelledAt: new Date(), cancelReason: change.reason } : {}),
        ...(change.status === 'REQUESTED' ? { confirmedAt: null, cancelledAt: null } : {}),
      },
      include: INCLUDE,
    });
    await audit(tx, { action: 'hotel_booking_status', entityType: 'trip', entityId: b.tripId, userId: actorId, description: `Hotel ${b.hotelName}: ${b.status} → ${change.status}${confirmationNo && change.status === 'CONFIRMED' ? ` (conf. ${confirmationNo})` : ''}${change.reason ? ` — ${change.reason}` : ''}`, before: { hotelBookingId: id, status: b.status }, after: { status: change.status, confirmationNo } });
    await tripChanged(tx, b.tripId, 'hotel_booking_status', actorId);
    return a;
  });
  return hotelBookingDto(row, role);
}
