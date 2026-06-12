// ============================================================
// GK TRAVELS CRM — AI Message Service
//
// Generates WhatsApp messages from trip data using Gemini.
// All facts (names, amounts, dates, services) come straight from
// the database — Gemini only writes the prose around them.
// ============================================================

import { startOfDay, endOfDay, format, isValid } from 'date-fns';
import type { TripService } from '@prisma/client';
import { prisma }     from '../lib/prisma.js';
import { callGemini } from '../lib/gemini.js';

const MESSAGE_SYSTEM_PROMPT = `
You are a professional travel agency assistant for GK Travels,
a travel agency based in Belagavi, Karnataka, India.

Your job is to write WhatsApp messages for customers.

Rules:
- Always use the exact data provided — never invent names, amounts, or dates
- Format for WhatsApp: use *bold* for important items
- Keep messages under 150 words
- Be warm, professional, and concise
- Write in English only
- Return only the message text — no explanation, no preamble, no markdown code blocks
- Do not add any text before or after the message
`;

// ── Helpers ──────────────────────────────────────────────────

function formatINR(amount: number): string {
  return '₹' + Number(amount).toLocaleString('en-IN');
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function formatDate(value: string | null): string {
  if (!value) return 'TBD';
  const d = new Date(value);
  return isValid(d) ? format(d, 'd MMMM yyyy') : 'TBD';
}

function detailsOf(service: TripService): Record<string, unknown> {
  return (service.details as Record<string, unknown>) ?? {};
}

function summarizeService(service: TripService): string {
  const d = detailsOf(service);
  switch (service.type) {
    case 'FLIGHT':
      return `${(d.airline as string) ?? 'Flight'} ${(d.flightNo as string) ?? ''} — ${(d.from as string) ?? ''} to ${(d.to as string) ?? ''}`.trim();
    case 'HOTEL':
      return `${(d.propertyName as string) ?? 'Hotel'} (${(d.nights as string | number) ?? ''} nights)`;
    case 'VEHICLE':
      return `${(d.vehicleType as string) ?? 'Vehicle'} — ${(d.pickup as string) ?? ''} to ${(d.drop as string) ?? ''}`;
    case 'ACTIVITY':
      return `${(d.name as string) ?? 'Activity'} at ${(d.location as string) ?? ''}`;
    case 'TRANSFER':
      return `Transfer — ${(d.from as string) ?? ''} to ${(d.to as string) ?? ''}`;
    default:
      return service.type;
  }
}

function buildResult(text: string) {
  const message = text.trim();
  return { message, preview: message.slice(0, 100) + '...' };
}

const agencyPhone = () => process.env.AGENCY_OWNER_PHONE ?? '';

// ── generatePaymentReminder ─────────────────────────────────

export async function generatePaymentReminder(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new Error('Trip not found');

  const departureDate = trip.departure ? new Date(trip.departure) : null;
  const daysUntilDeparture = departureDate && isValid(departureDate)
    ? Math.ceil((departureDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  const context = {
    customerName:       firstName(trip.customer),
    tripName:           trip.destination,
    departureDate:      formatDate(trip.departure),
    totalAmount:        formatINR(trip.totalAmount ?? 0),
    paidAmount:         formatINR(trip.paidAmount),
    balanceDue:         formatINR(trip.balanceDue),
    daysUntilDeparture,
    agencyName:         'GK Travels',
    agencyPhone:        agencyPhone(),
  };

  const userPrompt = `Generate a payment reminder WhatsApp message using this trip data:
${JSON.stringify(context, null, 2)}

The message should:
- Greet the customer by first name
- Mention the trip name and departure date
- State the balance due amount clearly using *bold*
- Request payment politely with a gentle urgency if departure is within 7 days
- Include agency phone number
- End with a warm closing`;

  const text = await callGemini(MESSAGE_SYSTEM_PROMPT, userPrompt, 300);
  return buildResult(text);
}

// ── generateBookingConfirmation ─────────────────────────────

export async function generateBookingConfirmation(tripId: string) {
  const trip = await prisma.trip.findUnique({
    where:   { id: tripId },
    include: { services: { orderBy: [{ serviceDate: 'asc' }, { startTime: 'asc' }] } },
  });
  if (!trip) throw new Error('Trip not found');

  const context = {
    customerName: firstName(trip.customer),
    bookingRef:   trip.id.slice(-8).toUpperCase(),
    tripName:     trip.destination,
    departureDate: formatDate(trip.departure),
    returnDate:    trip.returnDate ? formatDate(trip.returnDate) : null,
    pax:           trip.pax,
    totalAmount:   formatINR(trip.totalAmount ?? 0),
    balanceDue:    formatINR(trip.balanceDue),
    services:      trip.services.map(summarizeService),
    agencyName:    'GK Travels',
    agencyPhone:   agencyPhone(),
  };

  const userPrompt = `Generate a booking confirmation WhatsApp message using this data:
${JSON.stringify(context, null, 2)}

The message should:
- Confirm the booking with enthusiasm
- List all services using the services array (one per line with ✓)
- State booking reference in *bold*
- Mention departure date and total amount
- Reassure the customer everything is arranged
- Be warm and professional`;

  const text = await callGemini(MESSAGE_SYSTEM_PROMPT, userPrompt, 400);
  return buildResult(text);
}

// ── generateTravelReminder ──────────────────────────────────

export async function generateTravelReminder(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new Error('Trip not found');

  let firstService: TripService | undefined;
  if (trip.departure) {
    const day = new Date(trip.departure);
    if (isValid(day)) {
      const services = await prisma.tripService.findMany({
        where:   { tripId, serviceDate: { gte: startOfDay(day), lte: endOfDay(day) } },
        orderBy: { startTime: 'asc' },
      });
      firstService = services[0];
    }
  }

  const d = firstService ? detailsOf(firstService) : {};
  const meetingPoint = (d.pickup as string) ?? (d.from as string) ?? (d.airport as string) ?? 'Departure point';
  const reportingTime = firstService?.startTime ?? 'As scheduled';

  const context = {
    customerName:  firstName(trip.customer),
    tripName:      trip.destination,
    departureDate: formatDate(trip.departure),
    reportingTime,
    meetingPoint,
    agencyPhone:   agencyPhone(),
  };

  const userPrompt = `Generate a travel day reminder WhatsApp message using this data:
${JSON.stringify(context, null, 2)}

The message should:
- Wish the customer a wonderful trip
- Remind them of today's reporting time and meeting point in *bold*
- Offer agency contact for last minute help
- Be brief and enthusiastic — this is a morning message`;

  const text = await callGemini(MESSAGE_SYSTEM_PROMPT, userPrompt, 250);
  return buildResult(text);
}

// ── generateDriverDetails ────────────────────────────────────

export async function generateDriverDetails(tripServiceId: string) {
  const service = await prisma.tripService.findUnique({
    where:   { id: tripServiceId },
    include: { trip: true },
  });
  if (!service) throw new Error('Trip service not found');

  if (service.type !== 'VEHICLE' && service.type !== 'TRANSFER') {
    throw new Error('Driver details only available for vehicle or transfer services');
  }

  const d = detailsOf(service);
  const driverName     = (d.driverName as string) ?? 'Driver';
  const driverPhone    = (d.driverPhone as string) ?? 'Contact agency';
  const vehicleType    = (d.vehicleType as string) ?? 'Vehicle';
  const vehicleNo      = (d.vehicleNo as string) ?? '';
  const pickupTime     = service.startTime ?? (d.reportingTime as string) ?? 'As scheduled';
  const pickupLocation = (d.pickup as string) ?? (d.pickupLocation as string) ?? '';

  const context = {
    customerName: firstName(service.trip.customer),
    tripName:     service.trip.destination,
    driverName,
    driverPhone,
    vehicleType,
    vehicleNo,
    pickupTime,
    pickupLocation,
    agencyPhone:  agencyPhone(),
  };

  const userPrompt = `Generate a driver details WhatsApp message using this data:
${JSON.stringify(context, null, 2)}

The message should:
- Share driver name and phone in *bold*
- State vehicle type and number
- State pickup time and location clearly
- Tell customer to call driver 30 minutes before pickup
- Keep it short — customer will screenshot this`;

  const text = await callGemini(MESSAGE_SYSTEM_PROMPT, userPrompt, 250);
  return buildResult(text);
}

// ── generateCustomMessage ────────────────────────────────────

export async function generateCustomMessage(params: {
  tripId:      string;
  instruction: string;
  tone:        'formal' | 'friendly' | 'urgent';
}) {
  if (!params.instruction.trim()) throw new Error('Instruction is required');

  const trip = await prisma.trip.findUnique({ where: { id: params.tripId } });
  if (!trip) throw new Error('Trip not found');

  const context = {
    customerName:  firstName(trip.customer),
    tripName:      trip.destination,
    departureDate: formatDate(trip.departure),
    agencyName:    'GK Travels',
    agencyPhone:   agencyPhone(),
  };

  const userPrompt = `Generate a WhatsApp message for this customer and trip:
${JSON.stringify(context, null, 2)}

Agent instruction: ${params.instruction}
Tone: ${params.tone}

Return only the message text.`;

  const text = await callGemini(MESSAGE_SYSTEM_PROMPT, userPrompt, 300);
  return buildResult(text);
}
