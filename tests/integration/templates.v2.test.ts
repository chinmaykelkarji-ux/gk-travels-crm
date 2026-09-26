// Message templates: seeded once per organisation, the owner's edits are
// kept, system templates are switched off rather than deleted.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser } from './helpers/db';
import { as, USER_IDS } from './helpers/app';
import { SYSTEM_TEMPLATES } from '../../src/shared/calc/templates';

describe.skipIf(!hasTestDb)('message templates', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS', 'DRIVER'] as const) await seedUser(USER_IDS[role], role);
  });

  it('seeds the system set for WhatsApp and email the first time, and never again over an edit', async () => {
    const first = await as('BOOKING').get('/api/v2/templates');
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(SYSTEM_TEMPLATES.length * 2);
    const wa = first.body.items.find((t: { key: string; channel: string }) => t.key === 'payment_reminder' && t.channel === 'WHATSAPP');
    expect(wa).toMatchObject({ isSystem: true, enabled: true, subject: null, placeholders: expect.arrayContaining(['customer_name', 'amount_due']) });

    const edited = await as('ADMIN').patch(`/api/v2/templates/${wa.id}`, { body: 'Namaste {{customer_name}} Ji, {{amount_due}} is due. — {{agency_name}}', metaTemplateName: 'payment_reminder_v1' });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    const again = await as('ADMIN').get('/api/v2/templates');
    expect(again.body.items).toHaveLength(SYSTEM_TEMPLATES.length * 2);
    expect(again.body.items.find((t: { id: string }) => t.id === wa.id)).toMatchObject({ body: expect.stringContaining('is due. —'), metaTemplateName: 'payment_reminder_v1', purpose: expect.any(String) });
    expect(await prisma.activityLog.count({ where: { action: 'template_updated', entityId: wa.id, userId: USER_IDS.ADMIN } })).toBe(1);

    const reset = await as('ADMIN').post(`/api/v2/templates/${wa.id}/reset`);
    expect(reset.body.body).toBe(SYSTEM_TEMPLATES.find(t => t.key === 'payment_reminder')!.body);
  });

  it('refuses a placeholder it cannot fill, and only the owner changes wording', async () => {
    const [t] = (await as('ADMIN').get('/api/v2/templates')).body.items;
    const bad = await as('ADMIN').patch(`/api/v2/templates/${t.id}`, { body: 'Hello {{visa_number}}' });
    expect(bad.status).toBe(400);
    expect((await as('BOOKING').patch(`/api/v2/templates/${t.id}`, { enabled: false })).status).toBe(403);
    expect((await as('DRIVER').get('/api/v2/templates')).status).toBe(403);
  });

  it('system templates are switched off, not deleted; the office can add and remove its own', async () => {
    const [sys] = (await as('ADMIN').get('/api/v2/templates')).body.items;
    expect((await as('ADMIN').delete(`/api/v2/templates/${sys.id}`)).status).toBe(409);
    const off = await as('ADMIN').patch(`/api/v2/templates/${sys.id}`, { enabled: false });
    expect(off.body.enabled).toBe(false);

    const mine = await as('ADMIN').post('/api/v2/templates', { key: 'visa_documents', channel: 'EMAIL', name: 'Visa documents', subject: 'Visa papers for {{trip_name}}', body: 'Namaste {{customer_name}} Ji, please send the {{document_needed}}. — {{agency_name}}' });
    expect(mine.status, JSON.stringify(mine.body)).toBe(201);
    expect((await as('ADMIN').post('/api/v2/templates', { key: 'visa_documents', channel: 'EMAIL', name: 'Again', subject: 'x', body: 'Hello' })).status).toBe(409);
    expect((await as('ADMIN').delete(`/api/v2/templates/${mine.body.id}`)).status).toBe(204);
  });
});
