// ============================================================
// The classic outbox, retired (Phase 7.4).
//
// The classic scheduler wrote outbox events that were sent through a BSP
// gateway. Its rules are now automation rules the owner can see and switch
// (modules/automation), and WhatsApp leaves TravelOS only through the
// official Meta Cloud API. Anything still waiting in the old outbox is closed
// here with the reason, never sent — the history stays readable.
// ============================================================

import { prisma } from '../lib/prisma.js';

export const RETIRED_REASON = 'Not sent: the classic scheduler was replaced by automation rules (Phase 7.4). Switch on the matching rule under Settings → Automations.';

export async function retireLegacyOutbox(): Promise<{ retired: number }> {
  const r = await prisma.outboxEvent.updateMany({
    where: { status: { in: ['PENDING', 'PROCESSING'] } },
    data: { status: 'FAILED', lastError: RETIRED_REASON, processedAt: new Date() },
  });
  return { retired: r.count };
}
