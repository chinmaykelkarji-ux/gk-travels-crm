// Automation rules — what the settings screen may change.
import { z } from 'zod';
import type { AutomationAction, ParamDef, RunOutcome } from '../calc/automation';

export const AutomationUpdate = z.object({
  enabled: z.boolean().optional(),
  params: z.record(z.string(), z.union([z.number(), z.array(z.number())])).optional(),
  channel: z.enum(['WHATSAPP', 'EMAIL']).optional(),
});
export type AutomationUpdate = z.infer<typeof AutomationUpdate>;

export interface AutomationRuleView {
  id: string; key: string; name: string; description: string; customerFacing: boolean; replaces: string | null;
  enabled: boolean; enabledAt: string | null; params: Record<string, number | number[]>; paramDefs: ParamDef[];
  actions: (AutomationAction & { label: string })[]; last30: Record<string, number>; updatedAt: string;
}
export interface AutomationRunView { id: string; status: string; summary: string; outcomes: RunOutcome[]; entityType: string | null; entityId: string | null; at: string }
