// ============================================================
// GK TRAVELS CRM — AI Layer routes
//
// Server-side generation only: frontend submits context (tripId /
// tripServiceId), backend pulls facts from the DB, Gemini writes
// the prose. Single request → single response, no streaming.
// ============================================================

import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/permissions.js';
import {
  generatePaymentReminder,
  generateBookingConfirmation,
  generateTravelReminder,
  generateDriverDetails,
  generateCustomMessage,
} from '../services/aiMessageService.js';
import {
  generateItinerary,
  generateItinerarySummary,
} from '../services/aiItineraryService.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission('ai:use'));

// ── handleAiRoute ─────────────────────────────────────────────
// Wraps every AI call so generation failures never crash the server.

async function handleAiRoute(res: Response, fn: () => Promise<unknown>): Promise<void> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    console.log(`[AI] Success in ${duration}ms`);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI generation failed';
    console.error('[AI] Error:', message);

    if (message.includes('not found')) {
      res.status(404).json({ error: message });
    } else if (message.includes('invalid JSON') || message.includes('incomplete')) {
      res.status(422).json({ error: message });
    } else {
      res.status(500).json({ error: 'AI generation failed', details: message });
    }
  }
}

// ── Message routes ───────────────────────────────────────────

router.post('/message/payment-reminder', (req, res) => {
  const { tripId } = req.body as { tripId?: string };
  if (!tripId) { res.status(400).json({ error: 'tripId is required' }); return; }
  void handleAiRoute(res, () => generatePaymentReminder(tripId));
});

router.post('/message/booking-confirmation', (req, res) => {
  const { tripId } = req.body as { tripId?: string };
  if (!tripId) { res.status(400).json({ error: 'tripId is required' }); return; }
  void handleAiRoute(res, () => generateBookingConfirmation(tripId));
});

router.post('/message/travel-reminder', (req, res) => {
  const { tripId } = req.body as { tripId?: string };
  if (!tripId) { res.status(400).json({ error: 'tripId is required' }); return; }
  void handleAiRoute(res, () => generateTravelReminder(tripId));
});

router.post('/message/driver-details', (req, res) => {
  const { tripServiceId } = req.body as { tripServiceId?: string };
  if (!tripServiceId) { res.status(400).json({ error: 'tripServiceId is required' }); return; }
  void handleAiRoute(res, () => generateDriverDetails(tripServiceId));
});

const VALID_TONES = ['formal', 'friendly', 'urgent'] as const;

router.post('/message/custom', (req, res) => {
  const { tripId, instruction, tone } = req.body as {
    tripId?: string;
    instruction?: string;
    tone?: string;
  };
  if (!tripId) { res.status(400).json({ error: 'tripId is required' }); return; }
  if (!instruction || !instruction.trim()) { res.status(400).json({ error: 'Instruction is required' }); return; }

  const safeTone = (VALID_TONES as readonly string[]).includes(tone ?? '')
    ? (tone as typeof VALID_TONES[number])
    : 'friendly';

  void handleAiRoute(res, () => generateCustomMessage({
    tripId,
    instruction: instruction.slice(0, 500),
    tone:        safeTone,
  }));
});

// ── Itinerary routes ──────────────────────────────────────────

const VALID_STYLES = ['detailed', 'brief'] as const;

router.post('/itinerary/generate', (req, res) => {
  const { tripId, style } = req.body as { tripId?: string; style?: string };
  if (!tripId) { res.status(400).json({ error: 'tripId is required' }); return; }

  const safeStyle = (VALID_STYLES as readonly string[]).includes(style ?? '')
    ? (style as typeof VALID_STYLES[number])
    : 'detailed';

  void handleAiRoute(res, () => generateItinerary(tripId, { style: safeStyle }));
});

router.post('/itinerary/summary', (req, res) => {
  const { tripId } = req.body as { tripId?: string };
  if (!tripId) { res.status(400).json({ error: 'tripId is required' }); return; }
  void handleAiRoute(res, () => generateItinerarySummary(tripId));
});

export default router;
