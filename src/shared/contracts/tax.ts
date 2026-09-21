// Tax rules: the rates the business charges, with the day each starts.
import { z } from 'zod';

const day = z.string().date('Use YYYY-MM-DD');

export const TaxRuleUpsert = z.object({
  rate:          z.coerce.number().min(0, 'Cannot be negative').max(100, 'A rate cannot be more than 100%'),
  /** Yearly limit per customer before the tax applies (TCS); zero for GST. */
  threshold:     z.coerce.number().min(0).max(100_000_000).default(0),
  enabled:       z.boolean().default(true),
  effectiveFrom: day,
  effectiveTo:   day.optional().nullable(),
  note:          z.string().trim().max(500).optional().nullable().transform(v => (v ? v : null)),
}).superRefine((v, ctx) => {
  if (v.effectiveTo && v.effectiveTo < v.effectiveFrom) ctx.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'The end date is before the start date' });
});
export type TaxRuleUpsert = z.infer<typeof TaxRuleUpsert>;

export const TaxRuleQuery = z.object({ on: day.optional() });
export type TaxRuleQuery = z.infer<typeof TaxRuleQuery>;
