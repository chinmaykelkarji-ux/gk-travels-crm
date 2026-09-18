// Tenant isolation — the scoped Prisma client must make another
// organisation's rows invisible and unreachable, and must stamp new rows.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedCompany, seedCustomer, ensureOrganization } from './helpers/db';

const ctx = hasTestDb ? await import('../../server/src/core/requestContext.js') : null;
const invoiceSvc = hasTestDb ? await import('../../server/src/services/invoiceService.js') : null;

const ORG_A = 'org_gktravels';
const ORG_B = 'org_other_agency';

describe.skipIf(!hasTestDb)('tenant scoping', () => {
  beforeAll(async () => { await resetDb(); });
  beforeEach(async () => {
    await resetDb();
    await ensureOrganization(ORG_B, 'Other Agency');
    await seedCustomer('CUS-A-0001', { name: 'Customer A' });
    await ctx!.runAsOrganization(ORG_B, () => prisma.customer.create({
      data: { id: 'CUS-B-0001', name: 'Customer B', phone: '1', createdDate: '2026-09-01' },
    }));
  });

  it('stamps organizationId on create from the context (default org when none)', async () => {
    const a = await prisma.customer.findUniqueOrThrow({ where: { id: 'CUS-A-0001' } });
    expect(a.organizationId).toBe(ORG_A);
    const b = await ctx!.runAsOrganization(ORG_B, () => prisma.customer.findUniqueOrThrow({ where: { id: 'CUS-B-0001' } }));
    expect(b.organizationId).toBe(ORG_B);
  });

  it('findMany / count only return the current organisation', async () => {
    expect((await prisma.customer.findMany()).map(c => c.id)).toEqual(['CUS-A-0001']);
    expect(await prisma.customer.count()).toBe(1);
    await ctx!.runAsOrganization(ORG_B, async () => {
      expect((await prisma.customer.findMany()).map(c => c.id)).toEqual(['CUS-B-0001']);
    });
  });

  it('findUnique / update / delete cannot reach another organisation\'s row', async () => {
    expect(await prisma.customer.findUnique({ where: { id: 'CUS-B-0001' } })).toBeNull();
    await expect(prisma.customer.update({ where: { id: 'CUS-B-0001' }, data: { name: 'hacked' } })).rejects.toThrow();
    await expect(prisma.customer.delete({ where: { id: 'CUS-B-0001' } })).rejects.toThrow();
    expect(await prisma.customer.updateMany({ where: { name: 'Customer B' }, data: { name: 'x' } })).toEqual({ count: 0 });
    // Untouched, as seen from its own organisation.
    const b = await ctx!.runAsOrganization(ORG_B, () => prisma.customer.findUniqueOrThrow({ where: { id: 'CUS-B-0001' } }));
    expect(b.name).toBe('Customer B');
  });

  it("upsert cannot reach another organisation's row by its id", async () => {
    // Prisma finds nothing (scoped), tries to create, hits the primary key,
    // retries as a scoped update and reports not-found. Either way: rejected,
    // and the other organisation's row is untouched.
    await expect(prisma.customer.upsert({
      where: { id: 'CUS-B-0001' },
      create: { id: 'CUS-B-0001', name: 'dup', phone: '2', createdDate: '2026-09-01' },
      update: { name: 'hijack' },
    })).rejects.toThrow();
    const b = await ctx!.runAsOrganization(ORG_B, () => prisma.customer.findUniqueOrThrow({ where: { id: 'CUS-B-0001' } }));
    expect(b.name).toBe('Customer B');
    expect(await prisma.customer.count()).toBe(1);
  });

  it('company settings and invoice numbering are independent per organisation', async () => {
    await seedCompany();
    await ctx!.runAsOrganization(ORG_B, () => seedCompany({ companyName: 'Other Agency', gstin: '27BBBBB0000B1Z5', stateCode: '27' }));

    const line = { description: 'Package', rate: 1_000, quantity: 1, gstRate: 5 };
    const a1 = await invoiceSvc!.createInvoice({ invoiceDate: '2026-09-18', customerId: 'CUS-A-0001', customerName: 'A', items: [line] });
    const b1 = await ctx!.runAsOrganization(ORG_B, () => invoiceSvc!.createInvoice({ invoiceDate: '2026-09-18', customerId: 'CUS-B-0001', customerName: 'B', items: [line] }));
    const a2 = await invoiceSvc!.createInvoice({ invoiceDate: '2026-09-18', customerId: 'CUS-A-0001', customerName: 'A', items: [line] });

    expect(a1.invoiceNumber).toBe('GK/2026-27/01');
    expect(b1.invoiceNumber).toBe('GK/2026-27/01');   // own sequence
    expect(a2.invoiceNumber).toBe('GK/2026-27/02');
    expect(b1.companyName).toBe('Other Agency');
    expect(b1.companyStateCode).toBe('27');
    expect(await prisma.invoice.count()).toBe(2);
    expect(await ctx!.runAsOrganization(ORG_B, () => prisma.invoice.count())).toBe(1);
  });

  it('the audit writer records source and request id from the context', async () => {
    const { audit } = await import('../../server/src/core/audit.js');
    await ctx!.runWithContext({ requestId: 'req-test-1', userId: 'U-1', userRole: 'ADMIN', source: 'AI' }, () =>
      audit(prisma, { action: 'customer_updated', description: 'x', entityType: 'customer', entityId: 'CUS-A-0001' }));
    const row = await prisma.activityLog.findFirstOrThrow({ where: { entityId: 'CUS-A-0001' } });
    expect(row).toMatchObject({ source: 'AI', requestId: 'req-test-1', userId: 'U-1', organizationId: ORG_A });
  });
});
