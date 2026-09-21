// ============================================================
// Tax rules: the rates the business charges, kept as data with the day each
// one starts, so a rate change is a new row rather than a code change
// (hard rule 3). Every rule carries a note saying where the number comes
// from and what to verify with the CA.
//
// `rateFor()` is what the rest of the server calls; it falls back to the
// catalogue default when the owner has not set anything.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { notFound } from '../../core/errors.js';
import { istToday } from '../../../../src/shared/calc/istTime.js';
import { rateOn, ruleOn, TAX_RULES, TAX_RULE_BY_CODE, type TaxRuleValue } from '../../../../src/shared/calc/tax.js';
import type { TaxRuleUpsert } from '../../../../src/shared/contracts/tax.js';
import { isoDay, dayDate } from '../masters/common.js';

async function storedRules(db: DbClient): Promise<TaxRuleValue[]> {
  const rows = await db.taxRule.findMany({ orderBy: { effectiveFrom: 'desc' } });
  return rows.map(r => ({
    code: r.code, rate: Number(r.rate), threshold: Number(r.threshold), enabled: r.enabled,
    effectiveFrom: isoDay(r.effectiveFrom)!, effectiveTo: isoDay(r.effectiveTo),
  }));
}

/** The rate in force on a day (percent). Used by quotations, tickets and invoices. */
export async function rateFor(code: string, day = istToday(), db: DbClient = prisma): Promise<number> {
  return rateOn(await storedRules(db), code, day);
}

/** The whole rule (rate, limit, whether it is on) in force on a day. */
export async function ruleFor(code: string, day = istToday(), db: DbClient = prisma) {
  const stored = ruleOn(await storedRules(db), code, day);
  const def = TAX_RULE_BY_CODE.get(code);
  if (stored) return { ...stored, name: def?.name ?? code, kind: def?.kind ?? 'GST', basis: def?.basis ?? 'FULL_VALUE', note: def?.note ?? '' };
  if (!def) throw notFound('Tax rule');
  return { code, rate: def.defaultRate, threshold: def.defaultThreshold ?? 0, enabled: false, effectiveFrom: '1970-01-01', effectiveTo: null, name: def.name, kind: def.kind, basis: def.basis, note: def.note };
}

/** The catalogue with what is set today and the history behind it. */
export async function listRules(on = istToday()) {
  const rows = await prisma.taxRule.findMany({ orderBy: { effectiveFrom: 'desc' } });
  const stored = rows.map(r => ({
    id: r.id, code: r.code, rate: Number(r.rate), threshold: Number(r.threshold), enabled: r.enabled,
    effectiveFrom: isoDay(r.effectiveFrom)!, effectiveTo: isoDay(r.effectiveTo), note: r.note, updatedAt: r.updatedAt.toISOString(),
  }));
  const values: TaxRuleValue[] = stored;
  return TAX_RULES.map(def => {
    const current = ruleOn(values, def.code, on);
    return {
      ...def,
      current: current ? { rate: current.rate, threshold: current.threshold, enabled: current.enabled, effectiveFrom: current.effectiveFrom, effectiveTo: current.effectiveTo ?? null } : null,
      /** What the code will actually use today. */
      effectiveRate: rateOn(values, def.code, on),
      history: stored.filter(s => s.code === def.code),
    };
  });
}

export async function upsertRule(code: string, input: TaxRuleUpsert, actorId?: string | null) {
  const def = TAX_RULE_BY_CODE.get(code);
  if (!def) throw notFound('Tax rule');
  await prisma.$transaction(async tx => {
    const existing = await tx.taxRule.findFirst({ where: { code, effectiveFrom: dayDate(input.effectiveFrom)! } });
    const data: Prisma.TaxRuleUncheckedCreateInput = {
      code, rate: input.rate, threshold: input.threshold, enabled: input.enabled,
      effectiveFrom: dayDate(input.effectiveFrom)!, effectiveTo: dayDate(input.effectiveTo ?? null), note: input.note, updatedById: actorId ?? null,
    };
    if (existing) await tx.taxRule.update({ where: { id: existing.id }, data });
    else await tx.taxRule.create({ data });
    await audit(tx, {
      action: 'tax_rule_set', entityType: 'settings', entityId: `tax-rule:${code}`, userId: actorId,
      description: `${def.name}: ${input.enabled ? `${input.rate}%` : 'off'}${input.threshold ? ` above ₹${input.threshold.toLocaleString('en-IN')} a year` : ''} from ${input.effectiveFrom}${input.effectiveTo ? ` to ${input.effectiveTo}` : ''}`,
      before: existing ? { rate: Number(existing.rate), enabled: existing.enabled, threshold: Number(existing.threshold) } : null,
      after: { rate: input.rate, enabled: input.enabled, threshold: input.threshold, effectiveFrom: input.effectiveFrom },
    });
  });
  return listRules();
}
