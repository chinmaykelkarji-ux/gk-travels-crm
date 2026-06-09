import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    res.json(await prisma.passenger.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch passengers', details: String(err) });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const p = await prisma.passenger.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).json({ error: 'Passenger not found' });
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch passenger', details: String(err) });
  }
});

router.post('/', async (req, res) => {
  try {
    const p = await prisma.passenger.upsert({
      where:  { id: req.body.id },
      update: sanitize(req.body),
      create: sanitize(req.body),
    });
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save passenger', details: String(err) });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const p = await prisma.passenger.update({
      where: { id: req.params.id },
      data:  sanitize(req.body),
    });
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update passenger', details: String(err) });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.passenger.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete passenger', details: String(err) });
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
