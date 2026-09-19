// Shared helpers for trip operational records.
import type { DbClient } from '../../lib/prisma.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { canSeeCommercials } from '../../lib/redact.js';

export { n, isoDay, dayDate, changedKeys, pick } from '../masters/common.js';

/** Trip must exist and still be open for operational changes. */
export async function assertOpenTrip(db: DbClient, tripId: string): Promise<{ id: string; status: string; stage: string; pax: number; departure: string | null; returnDate: string | null; customerId: string | null }> {
  const t = await db.trip.findUnique({ where: { id: tripId }, select: { id: true, status: true, stage: true, pax: true, departure: true, returnDate: true, customerId: true } });
  if (!t) throw notFound('Trip');
  if (t.stage === 'CANCELLED' || t.stage === 'COMPLETED') throw stateConflict(`Trip ${tripId} is ${t.stage.toLowerCase()}; its bookings are fixed`);
  return t;
}

/** The party (booking contract) must belong to the same trip. */
export async function assertContractOnTrip(db: DbClient, tripId: string, contractId: string | null | undefined): Promise<void> {
  if (!contractId) return;
  const c = await db.bookingContract.findUnique({ where: { id: contractId }, select: { tripId: true } });
  if (!c || c.tripId !== tripId) throw new AppError('VALIDATION_ERROR', 400, 'That party is not on this trip', { contractId: 'Choose a party on this trip' });
}

/** Cost and sell may only be set by roles that see commercials; others keep the stored values. */
export function stripCommercials<T extends { costAmount?: unknown; sellAmount?: unknown }>(input: T, role: string | undefined): T {
  if (canSeeCommercials(role)) return input;
  const { costAmount: _c, sellAmount: _s, ...rest } = input;
  return rest as T;
}

export function money(role: string | undefined, cost: unknown, sell: unknown): { costAmount: number | null; sellAmount: number | null } {
  if (!canSeeCommercials(role)) return { costAmount: null, sellAmount: null };
  return { costAmount: cost === null || cost === undefined ? null : Number(cost), sellAmount: sell === null || sell === undefined ? null : Number(sell) };
}
