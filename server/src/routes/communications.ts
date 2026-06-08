// GET/POST /api/communications — outbound communication log
// (WhatsApp/email opens, quotation/itinerary/voucher sends).
// The server is the sole writer of both the Communication row and its
// paired ActivityLog entry — written atomically so the timeline never
// drifts out of sync with the communication log.

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { logActivity, buildActivityDescription } from '../lib/activity.js';
import type { Prisma } from '@prisma/client';

const router = Router();
router.use(requireAuth);

// The activity action reflects *what* was sent (derived from the entity it
// relates to), not the channel — "Quotation Sent" reads better in a timeline
// than "Message Sent (whatsapp)".
const COMM_ACTION_BY_ENTITY: Record<string, string> = {
  quotation: 'quotation_sent_comm',
  itinerary: 'itinerary_sent',
  voucher:   'voucher_sent',
};

// GET /api/communications?entityType=quotation&entityId=q123
router.get('/', async (req, res) => {
  try {
    const { entityType, entityId } = req.query as { entityType?: string; entityId?: string };
    const where: Prisma.CommunicationWhereInput = {};
    if (entityType) where.entityType = entityType;
    if (entityId)   where.entityId   = entityId;

    const comms = await prisma.communication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    500,
    });
    res.json(comms);
  } catch (err) {
    console.error('[communications GET]', err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/communications
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { type, recipient, subject, entityType, entityId } = req.body as {
      type?: string; recipient?: string; subject?: string;
      entityType?: string; entityId?: string;
    };

    if (!type || !recipient || !entityType || !entityId) {
      res.status(400).json({ error: 'type, recipient, entityType and entityId are required' });
      return;
    }

    const action = COMM_ACTION_BY_ENTITY[entityType] ?? 'communication_sent';
    const result = await prisma.$transaction(async (tx) => {
      const comm = await tx.communication.create({
        data: {
          type, recipient, subject: subject ?? null,
          entityType, entityId, userId: req.userId ?? null,
        },
      });

      await logActivity(tx, {
        action,
        description: buildActivityDescription(action, recipient, subject ?? undefined),
        entityType,
        entityId,
        userId:   req.userId,
        metadata: { type, recipient, subject: subject ?? null, communicationId: comm.id },
      });

      return comm;
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('[communications POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
