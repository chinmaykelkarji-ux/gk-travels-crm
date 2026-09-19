// ============================================================
// Classic bookings → tickets / hotel bookings / vehicle duties / activity
// bookings. The mapping lives in SQL (migration
// 20260918230100_import_legacy_bookings, function
// travelos_import_legacy_bookings) so the migration and this call share one
// definition. Idempotent: each classic booking is imported once; bookings
// made on the classic screen later are picked up by the hourly job or the
// "Import from classic" button.
// ============================================================

import { prisma } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { currentOrganizationId } from '../../core/requestContext.js';

export interface LegacyImportResult { tickets: number; hotels: number; vehicles: number; activities: number; skipped: number }

export async function importLegacyBookings(actorId?: string | null): Promise<LegacyImportResult> {
  const org = currentOrganizationId();
  const rows = await prisma.$queryRaw<{ result: LegacyImportResult }[]>`SELECT travelos_import_legacy_bookings(${org}) AS result`;
  const result = rows[0]?.result ?? { tickets: 0, hotels: 0, vehicles: 0, activities: 0, skipped: 0 };
  const imported = result.tickets + result.hotels + result.vehicles + result.activities;
  if (imported) {
    await audit(prisma, {
      action: 'legacy_bookings_imported', entityType: 'system', entityId: 'bookings', userId: actorId ?? null, source: actorId ? 'HUMAN' : 'SYSTEM',
      description: `Classic bookings imported: ${result.tickets} ticket(s), ${result.hotels} hotel(s), ${result.vehicles} vehicle duty(ies), ${result.activities} activity(ies)${result.skipped ? `; ${result.skipped} left on the classic screen (no trip or no date)` : ''}`,
      metadata: { ...result },
    });
  }
  return result;
}
