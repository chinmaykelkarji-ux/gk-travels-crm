// ============================================================
// Organisation settings with documented defaults. Tax and timing values are
// configuration, never constants in code (hard rule 3). Every default that
// depends on law or a supplier's policy says so, so the owner can check it.
// Stored in organizations.settings (JSON); missing keys fall back here.
// ============================================================

import { prismaUnscoped } from '../lib/prisma.js';
import { currentOrganizationId } from './requestContext.js';

export interface OrgSettings {
  taxes: {
    /** GST on the agency's own ticketing service fee, %. Default 18 — verify with CA. */
    ticketServiceFeeGstPct: number;
  };
}

export const SETTING_NOTES: Record<string, string> = {
  'taxes.ticketServiceFeeGstPct': 'GST on the ticketing service fee (the fee only, not the fare). 18% is the usual rate for travel-agent service charges — verify with CA.',
};

const DEFAULTS: OrgSettings = { taxes: { ticketServiceFeeGstPct: 18 } };

function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = b && typeof b === 'object' && !Array.isArray(b) ? merge(b, v) : (v ?? b);
  }
  return out as T;
}

export async function getOrgSettings(organizationId = currentOrganizationId()): Promise<OrgSettings> {
  const org = await prismaUnscoped.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  return merge(DEFAULTS, org?.settings);
}
