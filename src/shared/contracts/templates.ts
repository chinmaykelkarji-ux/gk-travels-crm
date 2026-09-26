// Message templates — shared by the settings screen and the API.
import { z } from 'zod';
import { TEMPLATE_CHANNELS, unknownPlaceholders } from '../calc/templates';

const text = (max: number) => z.string().trim().max(max);
const optional = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
/** For a patch: absent stays absent (unchanged); empty clears it. */
const patchable = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v === undefined ? undefined : v ? v : null));

const checkPlaceholders = (v: { subject?: unknown; body?: unknown }, ctx: z.RefinementCtx) => {
  const unknown = unknownPlaceholders(v.subject as string | null | undefined, v.body as string | undefined);
  if (unknown.length) ctx.addIssue({ code: 'custom', path: ['body'], message: `TravelOS cannot fill {{${unknown.join('}}, {{')}}}` });
};

export const TemplateChannel = z.enum(TEMPLATE_CHANNELS as [string, ...string[]]);

export const TemplateCreate = z.object({
  key: z.string().trim().min(3).max(60).regex(/^[a-z][a-z0-9_]*$/, 'Use lower-case letters, digits and _'),
  channel: TemplateChannel,
  name: text(120).min(2),
  purpose: optional(300),
  subject: optional(200),
  body: text(4000).min(2, 'Write the message'),
  metaTemplateName: optional(120),
  metaLanguage: z.string().trim().max(10).default('en'),
  enabled: z.boolean().default(true),
}).superRefine(checkPlaceholders);
export type TemplateCreate = z.infer<typeof TemplateCreate>;

export const TemplateUpdate = z.object({
  name: text(120).min(2).optional(),
  purpose: patchable(300),
  subject: patchable(200),
  body: text(4000).min(2, 'Write the message').optional(),
  metaTemplateName: patchable(120),
  metaLanguage: z.string().trim().max(10).optional(),
  enabled: z.boolean().optional(),
}).superRefine(checkPlaceholders);
export type TemplateUpdate = z.infer<typeof TemplateUpdate>;

export interface TemplateView {
  id: string; key: string; channel: 'WHATSAPP' | 'EMAIL'; name: string; purpose: string | null; subject: string | null; body: string;
  metaTemplateName: string | null; metaLanguage: string; isSystem: boolean; enabled: boolean; placeholders: string[]; updatedAt: string;
}
