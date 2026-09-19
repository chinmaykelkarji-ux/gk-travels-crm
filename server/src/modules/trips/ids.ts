import type { DbClient } from '../../lib/prisma.js';
import { nextFreeDisplayId } from '../../core/numbering.js';

/** GK-YYYY-NNNN trip ids from the sequence; skips numbers the classic client already used. */
export async function nextTripId(tx: DbClient): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const id = await nextFreeDisplayId(tx, 'GK');
    if (!(await tx.trip.findUnique({ where: { id }, select: { id: true } }))) return id;
  }
  throw new Error('Could not allocate a trip id');
}
