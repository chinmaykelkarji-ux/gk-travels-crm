// ============================================================
// Trip-change hooks. Operational services (hotels, vehicles, activities,
// tickets, travellers, itinerary) call tripChanged() inside their
// transaction after any write; other modules register reactions:
//   - trip readiness: a READY trip with a new blocker drops to CONFIRMING
//   - task engine: rule-generated tasks are recalculated for the trip
// Registration keeps the dependency one-way (services never import the
// modules that react to them).
// ============================================================

import type { DbClient } from '../../lib/prisma.js';

export type TripChangeHook = (tx: DbClient, tripId: string, reason: string, actorId?: string | null) => Promise<void>;

const hooks: { name: string; fn: TripChangeHook }[] = [];

export function registerTripChangeHook(name: string, fn: TripChangeHook): void {
  if (!hooks.some(h => h.name === name)) hooks.push({ name, fn });
}

export async function tripChanged(tx: DbClient, tripId: string | null | undefined, reason: string, actorId?: string | null): Promise<void> {
  if (!tripId) return;
  for (const h of hooks) await h.fn(tx, tripId, reason, actorId);
}
