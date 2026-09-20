// ============================================================
// Display numbers — human-readable ids such as CUS-2026-0042, generated on
// the server per organisation and period, never on the client.
//
// Uses NumberingSequence (docType = prefix, financialYear = calendar year for
// these ids). The upsert takes a row lock, so concurrent creates serialise;
// a first-of-year race on the create branch is retried.
// ============================================================

import { Prisma } from '@prisma/client';
import { prismaUnscoped, type DbClient } from '../lib/prisma.js';
import { currentOrganizationId } from './requestContext.js';

export type DisplayPrefix = 'CUS' | 'L' | 'ENQ' | 'Q' | 'BK' | 'TR' | 'VEN' | 'PAX' | 'GK' | 'TKT' | 'ITN' | 'JV' | 'RCP';

export interface DisplayIdOptions { width?: number; year?: number; /** Text before the year in the id; defaults to the prefix. */ displayPrefix?: string }

export async function nextDisplayId(db: DbClient, prefix: DisplayPrefix, opts: DisplayIdOptions = {}): Promise<string> {
  const year  = String(opts.year ?? new Date().getFullYear());
  const width = opts.width ?? 4;
  const organizationId = currentOrganizationId();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const seq = await db.numberingSequence.upsert({
        where:  { organizationId_docType_financialYear: { organizationId, docType: prefix, financialYear: year } },
        create: { id: `${organizationId}-${prefix}-${year}`, organizationId, docType: prefix, financialYear: year, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      return `${opts.displayPrefix ?? prefix}-${year}-${String(seq.lastNumber).padStart(width, '0')}`;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < 2) continue;
      throw err;
    }
  }
  throw new Error('numbering: could not allocate a display id');
}

// Tables whose primary key is the display id and that the classic screens
// still write with client-generated ids. The sequence can land on an id the
// classic client already used; those are skipped. Checked across all
// organisations because the primary key is global.
const TAKEN: Partial<Record<DisplayPrefix, (id: string) => Promise<boolean>>> = {
  CUS: async id => !!(await prismaUnscoped.customer.findUnique({ where: { id }, select: { id: true } })),
  L:   async id => !!(await prismaUnscoped.lead.findUnique({ where: { id }, select: { id: true } })),
  PAX: async id => !!(await prismaUnscoped.traveller.findUnique({ where: { id }, select: { id: true } })),
  GK:  async id => !!(await prismaUnscoped.trip.findUnique({ where: { id }, select: { id: true } })),
  VEN: async id => !!(await prismaUnscoped.vendor.findUnique({ where: { id }, select: { id: true } })),
  ITN: async id => !!(await prismaUnscoped.itinerary.findUnique({ where: { id }, select: { id: true } })),
  RCP: async id => !!(await prismaUnscoped.customerReceipt.findUnique({ where: { id }, select: { id: true } })),
};

/** nextDisplayId that never returns an id already used as a primary key. */
export async function nextFreeDisplayId(db: DbClient, prefix: DisplayPrefix, opts: DisplayIdOptions = {}): Promise<string> {
  const taken = TAKEN[prefix];
  for (let i = 0; i < 50; i++) {
    const id = await nextDisplayId(db, prefix, opts);
    if (!taken || !(await taken(id))) return id;
  }
  throw new Error(`numbering: no free ${prefix} id after 50 attempts`);
}

/** SQL that seeds a prefix's sequence from existing ids (used by migrations). */
export function seedSequenceSql(table: string, prefix: DisplayPrefix, organizationId = 'org_gktravels'): string {
  return `
INSERT INTO "numbering_sequences" ("id", "organizationId", "docType", "financialYear", "lastNumber", "updatedAt")
SELECT '${organizationId}-${prefix}-' || yr, '${organizationId}', '${prefix}', yr, maxn, NOW()
FROM (
  SELECT split_part("id", '-', 2) AS yr, MAX(NULLIF(split_part("id", '-', 3), '')::int) AS maxn
  FROM "${table}"
  WHERE "id" ~ '^${prefix}-[0-9]{4}-[0-9]+$' AND "organizationId" = '${organizationId}'
  GROUP BY 1
) s
ON CONFLICT ("organizationId", "docType", "financialYear")
DO UPDATE SET "lastNumber" = GREATEST("numbering_sequences"."lastNumber", EXCLUDED."lastNumber");`.trim();
}
