import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';
import { sendWhatsAppTemplate, sendWhatsAppText } from '../services/whatsapp.js';
import { sendEmail } from '../services/email.js';
import {
  paymentReminder,
  bookingConfirmation,
  travelReminder,
  hotelCheckInMessage,
  driverDetails,
  feedbackRequest,
  type WhatsAppMessage,
} from '../services/messageTemplates.js';

const router = Router();
router.use(requireAuth);

// Template builders take differently-shaped data objects (see
// messageTemplates.ts); `any` here is unavoidable for a generic
// templateName → builder registry. The caller is responsible for
// passing a `data` object matching the chosen template's shape.
const TEMPLATE_BUILDERS: Record<string, (data: any) => WhatsAppMessage> = {
  payment_reminder:     paymentReminder,
  booking_confirmation: bookingConfirmation,
  travel_reminder:      travelReminder,
  hotel_checkin:        hotelCheckInMessage,
  driver_details:       driverDetails,
  feedback_request:     feedbackRequest,
};

// ── POST /api/messaging/send-whatsapp ────────────────────────────
// Manual trigger — an employee sends a templated WhatsApp message
// to a customer (or the agency owner for internal alerts).

router.post('/send-whatsapp', requirePermission('messaging:write'), async (req, res) => {
  try {
    const { tripId, customerId, templateName, phone, data } = req.body as {
      tripId?: string;
      customerId?: string;
      templateName: string;
      phone: string;
      data: Record<string, unknown>;
    };

    const buildTemplate = TEMPLATE_BUILDERS[templateName];
    if (!buildTemplate) {
      res.status(400).json({ error: `Unknown template: ${templateName}` });
      return;
    }
    if (!phone) {
      res.status(400).json({ error: 'phone is required' });
      return;
    }

    const template = buildTemplate(data ?? {});
    const result = await sendWhatsAppTemplate(phone, template.templateName, template.params);
    if (!result.success) await sendWhatsAppText(phone, template.fallbackText);

    const log = await prisma.messageLog.create({
      data: {
        tripId:       tripId ?? null,
        customerId:   customerId ?? null,
        channel:      'WHATSAPP',
        templateName: template.templateName,
        recipient:    phone,
        content:      template.fallbackText,
        status:       result.success ? 'SENT' : 'FAILED',
        error:        result.error,
      },
    });

    res.status(201).json({ success: result.success, error: result.error, log });
  } catch (err) {
    console.error('[messaging send-whatsapp]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/messaging/send-whatsapp-text ───────────────────────
// Sends a free-form WhatsApp message (e.g. an AI-generated message,
// possibly edited by the agent) — bypasses the template registry.

router.post('/send-whatsapp-text', requirePermission('messaging:write'), async (req, res) => {
  try {
    const { tripId, customerId, phone, message } = req.body as {
      tripId?: string;
      customerId?: string;
      phone: string;
      message: string;
    };

    if (!phone)   { res.status(400).json({ error: 'phone is required' });   return; }
    if (!message) { res.status(400).json({ error: 'message is required' }); return; }

    const result = await sendWhatsAppText(phone, message);

    const log = await prisma.messageLog.create({
      data: {
        tripId:       tripId ?? null,
        customerId:   customerId ?? null,
        channel:      'WHATSAPP',
        templateName: 'ai_generated',
        recipient:    phone,
        content:      message,
        status:       result.success ? 'SENT' : 'FAILED',
        error:        result.error,
      },
    });

    res.status(201).json({ success: result.success, error: result.error, log });
  } catch (err) {
    console.error('[messaging send-whatsapp-text]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/messaging/send-email ───────────────────────────────

router.post('/send-email', requirePermission('messaging:write'), async (req, res) => {
  try {
    const { to, subject, html, tripId, customerId } = req.body as {
      to: string;
      subject: string;
      html: string;
      tripId?: string;
      customerId?: string;
    };

    if (!to || !subject || !html) {
      res.status(400).json({ error: 'to, subject and html are required' });
      return;
    }

    const result = await sendEmail({ to, subject, html });

    const log = await prisma.messageLog.create({
      data: {
        tripId:     tripId ?? null,
        customerId: customerId ?? null,
        channel:    'EMAIL',
        recipient:  to,
        content:    subject,
        status:     result.success ? 'SENT' : 'FAILED',
        error:      result.error,
      },
    });

    res.status(201).json({ success: result.success, error: result.error, log });
  } catch (err) {
    console.error('[messaging send-email]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/messaging/log?tripId=X ──────────────────────────────

router.get('/log', requirePermission('messaging:read'), async (req, res) => {
  try {
    const tripId = req.query.tripId as string | undefined;
    if (!tripId) {
      res.status(400).json({ error: 'tripId is required' });
      return;
    }
    const logs = await prisma.messageLog.findMany({
      where:   { tripId },
      orderBy: { sentAt: 'desc' },
    });
    res.json(logs);
  } catch (err) {
    console.error('[messaging log]', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
