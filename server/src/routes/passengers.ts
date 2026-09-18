import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';

const router = Router();
router.use(requireAuth);

// Passengers carry passport and visa data — same access as customers.

router.get('/', requirePermission('customers:read'), async (_req, res) => {
  try {
    res.json(await prisma.traveller.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (err) {
    console.error('[passengers GET]', err);
    res.status(500).json({ error: 'Failed to fetch passengers' });
  }
});

router.get('/:id', requirePermission('customers:read'), async (req, res) => {
  try {
    const p = await prisma.traveller.findUnique({ where: { id: String(req.params.id) } });
    if (!p) { res.status(404).json({ error: 'Passenger not found' }); return; }
    res.json(p);
  } catch (err) {
    console.error('[passengers GET /:id]', err);
    res.status(500).json({ error: 'Failed to fetch passenger' });
  }
});

router.post('/', requirePermission('customers:write'), async (req, res) => {
  try {
    const data = sanitize(req.body as Record<string, unknown>);
    if (!data.id) { res.status(400).json({ error: 'id is required' }); return; }
    const p = await prisma.traveller.upsert({
      where:  { id: data.id },
      update: data,
      create: data,
    });
    res.json(p);
  } catch (err) {
    console.error('[passengers POST]', err);
    res.status(500).json({ error: 'Failed to save passenger' });
  }
});

router.put('/:id', requirePermission('customers:write'), async (req, res) => {
  try {
    const { id: _ignored, ...data } = sanitize(req.body as Record<string, unknown>);
    const p = await prisma.traveller.update({
      where: { id: String(req.params.id) },
      data,
    });
    res.json(p);
  } catch (err) {
    console.error('[passengers PUT]', err);
    res.status(500).json({ error: 'Failed to update passenger' });
  }
});

router.delete('/:id', requirePermission('customers:write'), async (req, res) => {
  try {
    await prisma.traveller.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[passengers DELETE]', err);
    res.status(500).json({ error: 'Failed to delete passenger' });
  }
});

function sanitize(body: Record<string, unknown>) {
  const {
    id, customerId, firstName, lastName, displayName,
    dateOfBirth, nationality, gender,
    passportNumber, passportIssueDate, passportExpiry, placeOfIssue,
    visaStatus, visaExpiry, visaCountry, visaType,
    frequentFlyerNumber, mealPreference, seatPreference,
    emergencyContactName, emergencyContactPhone, emergencyRelation,
    notes, createdDate,
  } = body;
  return {
    id: id as string,
    customerId:            customerId            as string | undefined ?? null,
    firstName:             firstName             as string ?? '',
    lastName:              lastName              as string ?? '',
    displayName:           displayName           as string | undefined ?? null,
    dateOfBirth:           dateOfBirth           as string | undefined ?? null,
    nationality:           nationality           as string | undefined ?? null,
    gender:                gender                as string | undefined ?? null,
    passportNumber:        passportNumber        as string | undefined ?? null,
    passportIssueDate:     passportIssueDate     as string | undefined ?? null,
    passportExpiry:        passportExpiry        as string | undefined ?? null,
    placeOfIssue:          placeOfIssue          as string | undefined ?? null,
    visaStatus:            visaStatus            as string | undefined ?? null,
    visaExpiry:            visaExpiry            as string | undefined ?? null,
    visaCountry:           visaCountry           as string | undefined ?? null,
    visaType:              visaType              as string | undefined ?? null,
    frequentFlyerNumber:   frequentFlyerNumber   as string | undefined ?? null,
    mealPreference:        mealPreference        as string | undefined ?? null,
    seatPreference:        seatPreference        as string | undefined ?? null,
    emergencyContactName:  emergencyContactName  as string | undefined ?? null,
    emergencyContactPhone: emergencyContactPhone as string | undefined ?? null,
    emergencyRelation:     emergencyRelation     as string | undefined ?? null,
    notes:                 notes                 as string | undefined ?? null,
    createdDate:           createdDate           as string ?? new Date().toISOString().split('T')[0],
  };
}

export default router;
