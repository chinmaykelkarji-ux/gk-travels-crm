// ============================================================
// Display numbers — human-readable ids such as CUS-2026-0042, generated on
// the server per organisation and period, never on the client.
//
// Uses NumberingSequence (docType = prefix, financialYear = calendar year for
// these ids). The upsert takes a row lock, so concurrent creates serialise;
// a first-of-year race on the create branch is retried.
// ============================================================

import { Prisma } from '@prisma/client';
import type { DbClient } from '../lib/prisma.js';
import { currentOrganizationId } from './requestContext.js';

export type DisplayPrefix = 'CUS' | 'L' | 'ENQ' | 'Q' | 'BK' | 'TR' | 'VEN' | 'PAX' | 'GK' | 'TKT';

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
