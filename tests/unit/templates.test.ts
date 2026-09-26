// Message templates: every system template can be filled, a gap is never sent,
// and Meta receives the parameters in the order the body uses them.
import { describe, expect, it } from 'vitest';
import { PLACEHOLDERS, SAMPLE_VALUES, SYSTEM_TEMPLATES, placeholdersIn, renderTemplate, unknownPlaceholders } from '../../src/shared/calc/templates';
import { TemplateCreate, TemplateUpdate } from '../../src/shared/contracts/templates';

describe('the system set', () => {
  it('uses only placeholders TravelOS can fill, greets politely and signs off as the agency', () => {
    for (const t of SYSTEM_TEMPLATES) {
      expect(unknownPlaceholders(t.subject, t.body), t.key).toEqual([]);
      expect(t.body, t.key).toMatch(/^Namaste \{\{customer_name\}\} Ji,/);
      expect(t.body, t.key).toContain('{{agency_name}}');
    }
    expect(new Set(SYSTEM_TEMPLATES.map(t => t.key)).size).toBe(SYSTEM_TEMPLATES.length);
    expect(new Set(PLACEHOLDERS.map(p => p.key)).size).toBe(PLACEHOLDERS.length);
  });

  it('every system template renders completely with sample values', () => {
    for (const t of SYSTEM_TEMPLATES) {
      const r = renderTemplate(t, SAMPLE_VALUES);
      expect(r.missing, t.key).toEqual([]);
      expect(r.text).not.toMatch(/\{\{/);
    }
  });
});

describe('rendering', () => {
  const t = { subject: 'Reminder — {{trip_name}}', body: 'Namaste {{customer_name}} Ji, {{amount_due}} is due for {{trip_name}}.' };

  it('fills placeholders and gives Meta its parameters in body order, each once', () => {
    const r = renderTemplate(t, { customer_name: 'Ramesh Patil', amount_due: '₹45,000', trip_name: 'Kashi Yatra' });
    expect(r).toEqual({
      subject: 'Reminder — Kashi Yatra',
      text: 'Namaste Ramesh Patil Ji, ₹45,000 is due for Kashi Yatra.',
      missing: [], params: ['Ramesh Patil', '₹45,000', 'Kashi Yatra'],
    });
    expect(placeholdersIn(t.body)).toEqual(['customer_name', 'amount_due', 'trip_name']);
  });

  it('lists what is missing — blank counts as missing — and leaves the gap visible', () => {
    const r = renderTemplate(t, { customer_name: 'Ramesh Patil', amount_due: '  ', trip_name: null });
    expect(r.missing.sort()).toEqual(['amount_due', 'trip_name']);
    expect(r.text).toContain('{{amount_due}}');
  });
});

describe('saving a template', () => {
  it('refuses a placeholder TravelOS cannot fill, and a bad key', () => {
    const bad = TemplateCreate.safeParse({ key: 'visa_note', channel: 'EMAIL', name: 'Visa', subject: 'Visa', body: 'Hi {{customer_name}}, your {{visa_number}}' });
    expect(bad.success).toBe(false);
    expect(JSON.stringify(bad.error)).toContain('visa_number');
    expect(TemplateCreate.safeParse({ key: 'Visa Note', channel: 'EMAIL', name: 'Visa', body: 'Hello' }).success).toBe(false);
  });

  it('a patch leaves out what it does not mention, and an empty value clears it', () => {
    expect(TemplateUpdate.parse({ enabled: false })).toEqual({ enabled: false });
    expect(TemplateUpdate.parse({ metaTemplateName: '' })).toEqual({ metaTemplateName: null });
  });
});
