// Shared helpers for the operations masters (vendors, hotels, fleet, activities).
import type { Prisma } from '@prisma/client';
import type { DbClient } from '../../lib/prisma.js';
import { AppError } from '../../core/errors.js';

export const n = (v: Prisma.Decimal | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
export const isoDay = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
export const dayDate = (s: string | null | undefined): Date | null => (s ? new Date(`${s}T00:00:00.000Z`) : null);
export const today = () => new Date().toISOString().slice(0, 10);

/** Keys whose values differ, for audit before/after. */
export function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>, keys: string[]): string[] {
  return keys.filter(k => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
}

export function pick(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj[k] ?? null;
  return out;
}

/** 400 unless the vendor exists in this organisation (tenant-scoped client). */
export async function assertVendor(db: DbClient, vendorId: string | null | undefined, field = 'vendorId'): Promise<void> {
  if (!vendorId) return;
  const v = await db.vendor.findUnique({ where: { id: vendorId }, select: { id: true } });
  if (!v) throw new AppError('VALIDATION_ERROR', 400, 'Vendor not found', { [field]: 'Unknown vendor' });
}

export function page<T>(items: T[], total: number, q: { page: number; pageSize: number }) {
  return { items, total, page: q.page, pageSize: q.pageSize };
}
