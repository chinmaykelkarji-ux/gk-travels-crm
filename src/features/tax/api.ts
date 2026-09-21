import { api } from '@/lib/api';
import type { TaxKind, TaxRuleDef } from '@/shared/calc/tax';
import type { TaxRuleUpsert } from '@/shared/contracts/tax';

export interface TaxRuleRow extends TaxRuleDef {
  kind: TaxKind;
  current: { rate: number; threshold: number; enabled: boolean; effectiveFrom: string; effectiveTo: string | null } | null;
  effectiveRate: number;
  history: { id: string; rate: number; threshold: number; enabled: boolean; effectiveFrom: string; effectiveTo: string | null; note: string | null; updatedAt: string }[];
}

export const taxApi = {
  list: (on?: string) => api.get<TaxRuleRow[]>('/v2/tax-rules', { on }),
  save: (code: string, b: TaxRuleUpsert) => api.put<TaxRuleRow[]>(`/v2/tax-rules/${code}`, b),
};
