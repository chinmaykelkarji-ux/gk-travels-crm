// Sales pipeline v2: /api/v2/leads and /api/v2/enquiries.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import {
  LeadCreate, LeadUpdate, LeadListQuery, LeadStatusChange, LeadConvert, AssignInput, NoteInput,
  EnquiryCreate, EnquiryUpdate, EnquiryListQuery, EnquiryStatusChange, FollowUpInput,
} from '../../../../src/shared/contracts/sales.js';
import * as leads from '../../modules/sales/leads.service.js';
import * as enq from '../../modules/sales/enquiries.service.js';

export const leadsRouter = Router();
leadsRouter.use(requireAuth);

leadsRouter.get('/', requirePermission('enquiries:read'), validate({ query: LeadListQuery }), async (_req, res) => {
  res.json(await leads.listLeads(valid<unknown, z.infer<typeof LeadListQuery>>(res).query));
});
leadsRouter.get('/check-duplicates', requirePermission('enquiries:read'), async (req, res) => {
  res.json(await leads.findLeadDuplicates(String(req.query.phone ?? ''), typeof req.query.excludeId === 'string' ? req.query.excludeId : undefined));
});
leadsRouter.post('/', requirePermission('enquiries:write'), validate({ body: LeadCreate }), async (req: AuthRequest, res) => {
  res.status(201).json(await leads.createLead(valid<z.infer<typeof LeadCreate>>(res).body, req.userId));
});
leadsRouter.get('/:id', requirePermission('enquiries:read'), async (req, res) => {
  res.json(await leads.getLead(String(req.params.id)));
});
leadsRouter.put('/:id', requirePermission('enquiries:write'), validate({ body: LeadUpdate }), async (req: AuthRequest, res) => {
  res.json(await leads.updateLead(String(req.params.id), valid<z.infer<typeof LeadUpdate>>(res).body, req.userId));
});
leadsRouter.post('/:id/status', requirePermission('enquiries:write'), validate({ body: LeadStatusChange }), async (req: AuthRequest, res) => {
  const b = valid<z.infer<typeof LeadStatusChange>>(res).body;
  res.json(await leads.setLeadStatus(String(req.params.id), b.status, { lostReason: b.lostReason, note: b.note }, req.userId));
});
leadsRouter.post('/:id/assign', requirePermission('enquiries:write'), validate({ body: AssignInput }), async (req: AuthRequest, res) => {
  res.json(await leads.assignLead(String(req.params.id), valid<z.infer<typeof AssignInput>>(res).body.userId, req.userId));
});
leadsRouter.post('/:id/notes', requirePermission('enquiries:write'), validate({ body: NoteInput }), async (req: AuthRequest, res) => {
  res.json(await leads.addLeadNote(String(req.params.id), valid<z.infer<typeof NoteInput>>(res).body.note, req.userId));
});
leadsRouter.post('/:id/convert', requirePermission('enquiries:write'), validate({ body: LeadConvert }), async (req: AuthRequest, res) => {
  res.json(await leads.convertLead(String(req.params.id), valid<z.infer<typeof LeadConvert>>(res).body, req.userId));
});
leadsRouter.delete('/:id', requirePermission('enquiries:write'), async (req: AuthRequest, res) => {
  await leads.softDeleteLead(String(req.params.id), req.userId);
  res.json({ ok: true });
});

export const enquiriesRouter = Router();
enquiriesRouter.use(requireAuth);

enquiriesRouter.get('/', requirePermission('enquiries:read'), validate({ query: EnquiryListQuery }), async (_req, res) => {
  res.json(await enq.listEnquiries(valid<unknown, z.infer<typeof EnquiryListQuery>>(res).query));
});
enquiriesRouter.post('/', requirePermission('enquiries:write'), validate({ body: EnquiryCreate }), async (req: AuthRequest, res) => {
  res.status(201).json(await enq.createEnquiry(valid<z.infer<typeof EnquiryCreate>>(res).body, req.userId));
});
enquiriesRouter.get('/:id', requirePermission('enquiries:read'), async (req, res) => {
  res.json(await enq.getEnquiry(String(req.params.id)));
});
enquiriesRouter.put('/:id', requirePermission('enquiries:write'), validate({ body: EnquiryUpdate }), async (req: AuthRequest, res) => {
  res.json(await enq.updateEnquiry(String(req.params.id), valid<z.infer<typeof EnquiryUpdate>>(res).body, req.userId));
});
enquiriesRouter.post('/:id/status', requirePermission('enquiries:write'), validate({ body: EnquiryStatusChange }), async (req: AuthRequest, res) => {
  const b = valid<z.infer<typeof EnquiryStatusChange>>(res).body;
  res.json(await enq.setEnquiryStatus(String(req.params.id), b.status, { lostReason: b.lostReason, note: b.note }, req.userId));
});
enquiriesRouter.post('/:id/assign', requirePermission('enquiries:write'), validate({ body: AssignInput }), async (req: AuthRequest, res) => {
  res.json(await enq.assignEnquiry(String(req.params.id), valid<z.infer<typeof AssignInput>>(res).body.userId, req.userId));
});
enquiriesRouter.post('/:id/notes', requirePermission('enquiries:write'), validate({ body: NoteInput }), async (req: AuthRequest, res) => {
  res.json(await enq.addEnquiryNote(String(req.params.id), valid<z.infer<typeof NoteInput>>(res).body.note, req.userId));
});
enquiriesRouter.post('/:id/follow-up', requirePermission('enquiries:write'), validate({ body: FollowUpInput }), async (req: AuthRequest, res) => {
  res.status(201).json(await enq.createFollowUp(String(req.params.id), valid<z.infer<typeof FollowUpInput>>(res).body, req.userId));
});
enquiriesRouter.delete('/:id', requirePermission('enquiries:write'), async (req: AuthRequest, res) => {
  await enq.softDeleteEnquiry(String(req.params.id), req.userId);
  res.json({ ok: true });
});
