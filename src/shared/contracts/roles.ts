// Custom roles — what the owner may make.
import { z } from 'zod';

/** Never grantable to a custom role: everything, the driver view, and managing people. */
export const NOT_GRANTABLE = new Set(['*', 'driver:duties', 'users:write']);

export const RoleInput = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional().nullable().transform(v => (v ? v : null)),
  baseRole: z.enum(['BOOKING', 'ACCOUNTS', 'OPERATIONS']),
  permissions: z.array(z.string().trim().min(3).max(60)).max(200),
});
export type RoleInput = z.infer<typeof RoleInput>;

export const RoleAssign = z.object({ userId: z.string().trim().min(1).max(64), roleId: z.string().trim().max(64).nullable() });
export type RoleAssign = z.infer<typeof RoleAssign>;

const RESOURCE_LABEL: Record<string, string> = {
  customers: 'Customers', enquiries: 'Enquiries & leads', 'sales-quotes': 'Quotations', trips: 'Trips', 'trip-services': 'Trip services',
  bookings: 'Bookings', vouchers: 'Vouchers', tasks: 'Tasks', messaging: 'Messages', documents: 'Documents', dashboard: 'Dashboard',
  suppliers: 'Suppliers', masters: 'Hotels, fleet & activities', rates: 'Rates & prices', operations: 'Hotel / vehicle / ticket bookings',
  expenses: 'Spending', invoices: 'Invoices', payments: 'Payments', gst: 'GST', finance: 'Money & books', 'credit-notes': 'Credit notes',
  'debit-notes': 'Debit notes', commissions: 'Commissions', reports: 'Classic reports', ai: 'Classic AI writing', copilot: 'Copilot',
  insights: 'Insights & reports', settings: 'Settings', users: 'People',
};
const ACTION_LABEL: Record<string, string> = { read: 'see', write: 'change', status: 'update status', use: 'use', duties: 'duties' };

export function permissionLabel(p: string): string {
  const [res, act] = p.split(':');
  return `${RESOURCE_LABEL[res] ?? res}: ${ACTION_LABEL[act] ?? act}`;
}
