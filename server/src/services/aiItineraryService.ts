// ============================================================
// GK TRAVELS CRM — AI Itinerary Service
//
// Generates a day-by-day itinerary (and trip summary) from a
// trip's TripService records using Gemini. Gemini only writes
// prose — every fact (dates, places, services) comes from the DB.
// ============================================================

import { format, isValid } from 'date-fns';
import type { TripService } from '@prisma/client';
import { prisma }     from '../lib/prisma.js';
import { callGemini } from '../lib/gemini.js';

// ── Types ────────────────────────────────────────────────────

export interface ItineraryService {
  type:        string;
  time:        string;
  title:       string;
  description: string;
}

export interface ItineraryDay {
  dayNumber: number;
  date:      string;
  heading:   string;
  narrative: string;
  services:  ItineraryService[];
}

export interface GeneratedItinerary {
  title:       string;
  days:        ItineraryDay[];
  closingNote: string;
}

export interface ItinerarySummary {
  summary:      string;
  highlights:   string[];
  duration:     string;
  destinations: string[];
}

const ITINERARY_SYSTEM_PROMPT = `
You are a professional travel itinerary writer for GK Travels,
a travel agency based in Belagavi, Karnataka, India.

Rules:
- Never invent facts — only describe what is in the provided data
- Do not add hotels, activities, or places not in the data
- Write engaging day headings that capture the essence of each day
- Write narrative paragraphs (2-3 sentences) that connect the services warmly
- Use professional travel writing tone
- Return valid JSON only
- Do not wrap JSON in markdown code blocks
- Do not add any text before or after the JSON object
- All dates must exactly match the provided data
`;

// ── Helpers ──────────────────────────────────────────────────

function detailsOf(service: TripService): Record<string, unknown> {
  return (service.details as Record<string, unknown>) ?? {};
}

function formatFullDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return isValid(d) ? format(d, 'd MMMM yyyy') : 'TBD';
}

// Clean summary of a single service, per type — used as the
// factual basis Gemini writes its description around.
function summarizeService(service: TripService): { type: string; time: string; title: string; factLine: string } {
  const d = detailsOf(service);
  switch (service.type) {
    case 'FLIGHT':
      return {
        type:  'FLIGHT',
        time:  (d.departure as string) ?? service.startTime ?? 'TBD',
        title: `Flight — ${(d.from as string) ?? ''} to ${(d.to as string) ?? ''}`,
        factLine: `${(d.airline as string) ?? ''} ${(d.flightNo as string) ?? ''}`.trim(),
      };
    case 'HOTEL':
      return {
        type:  'HOTEL',
        time:  (d.checkIn as string) ?? service.startTime ?? 'Afternoon',
        title: `Check-in — ${(d.propertyName as string) ?? 'Hotel'}`,
        factLine: `${(d.roomType as string) ?? ''}, ${(d.nights as string | number) ?? ''} nights`.trim(),
      };
    case 'VEHICLE':
      return {
        type:  'VEHICLE',
        time:  (d.reportingTime as string) ?? service.startTime ?? 'As scheduled',
        title: `${(d.vehicleType as string) ?? 'Vehicle'} — ${(d.pickup as string) ?? ''} to ${(d.drop as string) ?? ''}`,
        factLine: `Driver: ${(d.driverName as string) ?? 'TBA'}`,
      };
    case 'ACTIVITY':
      return {
        type:  'ACTIVITY',
        time:  (d.reportingTime as string) ?? service.startTime ?? 'Morning',
        title: (d.name as string) ?? 'Activity',
        factLine: `${(d.location as string) ?? ''} — ${(d.duration as string) ?? ''}`,
      };
    case 'TRANSFER':
      return {
        type:  'TRANSFER',
        time:  service.startTime ?? 'As scheduled',
        title: `Transfer — ${(d.from as string) ?? ''} to ${(d.to as string) ?? ''}`,
        factLine: (d.vehicleType as string) ?? '',
      };
    default:
      return { type: service.type, time: service.startTime ?? 'TBD', title: service.type, factLine: '' };
  }
}

// Strip markdown code fences and parse the JSON object Gemini returned.
function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('AI returned invalid JSON — please try again');
  }
}

// ── generateItinerary ───────────────────────────────────────

export async function generateItinerary(
  tripId: string,
  options?: { style?: 'detailed' | 'brief' },
): Promise<GeneratedItinerary> {
  const trip = await prisma.trip.findUnique({
    where:   { id: tripId },
    include: { services: { orderBy: [{ serviceDate: 'asc' }, { startTime: 'asc' }] } },
  });
  if (!trip) throw new Error('Trip not found');
  if (trip.services.length === 0) {
    throw new Error('Trip has no services — add flights, hotels, and vehicles first');
  }

  // Group services by date (YYYY-MM-DD), preserving chronological order.
  const groups = new Map<string, TripService[]>();
  for (const service of trip.services) {
    const key = format(service.serviceDate, 'yyyy-MM-dd');
    const group = groups.get(key);
    if (group) group.push(service);
    else groups.set(key, [service]);
  }

  const sortedKeys = [...groups.keys()].sort();
  const dayStructure = sortedKeys.map((key, idx) => ({
    dayNumber: idx + 1,
    date:      formatFullDate(key),
    services:  groups.get(key)!.map(summarizeService),
  }));

  const userPrompt = `Write a professional travel itinerary for this trip.

Trip: ${trip.destination}
Passengers: ${trip.pax} people
Style: ${options?.style ?? 'detailed'}

Day-by-day services (these are facts — do not change them):
${JSON.stringify(dayStructure, null, 2)}

Return a JSON object with exactly this structure:
{
  "title": "An engaging title for this itinerary",
  "days": [
    {
      "dayNumber": 1,
      "date": "exact date from data",
      "heading": "Day 1 — Departure to [City]",
      "narrative": "2-3 sentences describing the day warmly",
      "services": [
        {
          "type": "FLIGHT",
          "time": "exact time from data",
          "title": "exact title from data",
          "description": "one warm sentence about this service"
        }
      ]
    }
  ],
  "closingNote": "A warm 2-sentence closing wishing the travellers well"
}

Important:
- dayNumber and date must match exactly
- services array must contain all services provided — do not drop any
- Do not add services that are not in the data
- Return only the JSON object`;

  const text   = await callGemini(ITINERARY_SYSTEM_PROMPT, userPrompt, 2000);
  const parsed = parseJsonResponse(text) as Partial<GeneratedItinerary>;

  if (!parsed.title || !Array.isArray(parsed.days)) {
    throw new Error('AI returned incomplete itinerary — please try again');
  }

  return parsed as GeneratedItinerary;
}

// ── generateItinerarySummary ────────────────────────────────

export async function generateItinerarySummary(tripId: string): Promise<ItinerarySummary> {
  const trip = await prisma.trip.findUnique({
    where:   { id: tripId },
    include: { services: true },
  });
  if (!trip) throw new Error('Trip not found');

  const destinations = new Set<string>();
  const serviceTypes  = new Set<string>();
  let nights = 0;

  for (const service of trip.services) {
    serviceTypes.add(service.type);
    if (service.type === 'HOTEL') nights += 1;

    const d = detailsOf(service);
    for (const key of ['to', 'location', 'drop'] as const) {
      const value = d[key];
      if (typeof value === 'string' && value.trim()) destinations.add(value.trim());
    }
  }

  const context = {
    tripName:      trip.destination,
    destinations:  [...destinations],
    departureDate: trip.departure  ? formatFullDate(trip.departure)  : 'TBD',
    returnDate:    trip.returnDate ? formatFullDate(trip.returnDate) : null,
    pax:           trip.pax,
    serviceTypes:  [...serviceTypes],
    nights,
  };

  const userPrompt = `Generate a trip summary for this travel itinerary:
${JSON.stringify(context, null, 2)}

Return JSON only:
{
  "summary": "2-3 sentence professional overview of the trip",
  "highlights": ["highlight 1", "highlight 2", "highlight 3"],
  "duration": "e.g. 5 Days / 4 Nights",
  "destinations": ["City 1", "City 2"]
}`;

  const text   = await callGemini(ITINERARY_SYSTEM_PROMPT, userPrompt, 500);
  return parseJsonResponse(text) as ItinerarySummary;
}
