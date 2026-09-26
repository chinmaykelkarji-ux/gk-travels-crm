// Per-organisation settings — the numbers an owner tunes, with the defaults
// TravelOS ships. Stored in organizations.settings; anything missing or
// invalid falls back to the default.
import { z } from 'zod';
import { INSIGHT_LIMITS } from '../calc/insights';

const InsightSettings = z.object({
  departingWithinDays: z.number().int().min(1).max(60).default(INSIGHT_LIMITS.departingWithinDays),
  overdueDays: z.number().int().min(1).max(365).default(INSIGHT_LIMITS.overdueDays),
  thinMarginPct: z.number().min(0).max(50).default(INSIGHT_LIMITS.thinMarginPct),
  passportWithinDays: z.number().int().min(7).max(365).default(INSIGHT_LIMITS.passportWithinDays),
});
const PortalSettings = z.object({ defaultLinkDays: z.number().int().min(1).max(365).default(90) });
const SECTIONS = { insights: InsightSettings, portal: PortalSettings } as const;

export const OrgSettings = z.object({ insights: InsightSettings.default({}), portal: PortalSettings.default({}) });
export type OrgSettings = z.infer<typeof OrgSettings>;

export const OrgSettingsPatch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().max(160).optional().nullable(),
  insights: InsightSettings.partial().optional(),
  portal: PortalSettings.partial().optional(),
});
export type OrgSettingsPatch = z.infer<typeof OrgSettingsPatch>;

/** Reads stored settings, keeping every valid value and defaulting the rest. */
export function readSettings(stored: unknown): OrgSettings {
  const base = OrgSettings.parse({});
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, Record<string, unknown>>;
  const pick = <K extends keyof OrgSettings>(k: K) => {
    const out = { ...base[k] } as Record<string, unknown>;
    for (const [field, v] of Object.entries(s[k] ?? {})) {
      const f = (SECTIONS[k].shape as Record<string, z.ZodTypeAny>)[field];
      if (f && f.safeParse(v).success) out[field] = f.parse(v);
    }
    return out as OrgSettings[K];
  };
  return { insights: pick('insights'), portal: pick('portal') };
}

export const OrganizationCreate = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(3).max(40).regex(/^[a-z0-9][a-z0-9-]*$/, 'Lower-case letters, digits and -'),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().trim().toLowerCase().email().max(160),
  adminPassword: z.string().min(10, 'At least 10 characters').max(200),
});
export type OrganizationCreate = z.infer<typeof OrganizationCreate>;
