// The customer's page talks to /api/portal only, with plain fetch: it has no
// staff session, and a 401 here means "enter your code", never "sign in".
export class PortalError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/portal/${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new PortalError(res.status, (body as { error?: { message?: string } }).error?.message ?? 'Something went wrong. Please try again.');
  return body as T;
}

export interface Agency { name: string; phone: string | null; email: string | null; website: string | null; address: string | null }
export interface Home { locked: false; customer: { name: string }; agency: Agency; trips: { id: string; name: string; destination: string; departure: string | null; returnDate: string | null; status: string }[] }
export interface Locked { locked: true; codeChannel: 'WHATSAPP' | 'EMAIL' | null }

export interface PortalTrip {
  trip: { id: string; name: string; destination: string; departure: string | null; returnDate: string | null; status: string };
  agency: Agency;
  travellers: { name: string; role: string }[];
  itinerary: { title: string; days: { dayNumber: number; date: string | null; title: string; morning: string | null; afternoon: string | null; evening: string | null; hotelName: string | null; meals: string[]; items: { time: string | null; kindLabel: string; title: string; details: string | null }[] }[] } | null;
  itineraryNote: string | null;
  pickupPoints: { name: string; landmark: string | null; address: string | null; time: string | null; mapUrl: string | null }[];
  tickets: { mode: string; pnr: string | null; carrier: string | null; travelClass: string | null; status: string; legs: { from: string; to: string; departs: string | null; arrives: string | null; service: string | null; boardingPoint: string | null; platform: string | null; terminal: string | null; passengers: { name: string; status: string; coach: string | null; seat: string | null; berth: string | null }[] }[] }[];
  stays: { hotel: string; city: string | null; checkIn: string; checkOut: string; rooms: number; roomType: string | null; meals: string | null; confirmationNo: string | null; status: string }[];
  transport: { vehicle: string | null; starts: string | null; ends: string | null; pickup: string | null; status: string; driver: { name: string | null; phone: string | null; vehicleNumber: string | null } | null; driverNote: string | null }[];
  payments: { party: string | null; total: number; received: number; balance: number; instalments: { label: string; dueDate: string; amount: number; paid: number; status: string }[] }[];
  receipts: { number: string; date: string; amount: number; mode: string }[];
  documents: { id: string; title: string; fileName: string; sizeBytes: number | null }[];
  updates: { subject: string | null; text: string | null; at: string | null }[];
  feedback: { rating: number; comments: string | null; at: string } | null;
  canGiveFeedback: boolean;
}

export const portalApi = {
  home: (t: string) => call<Home | Locked>(t),
  sendCode: (t: string) => call<{ sentTo: string }>(`${t}/code`, { method: 'POST', body: '{}' }),
  verify: (t: string, code: string) => call<{ ok: true }>(`${t}/code/verify`, { method: 'POST', body: JSON.stringify({ code }) }),
  trip: (t: string, id: string) => call<PortalTrip>(`${t}/trips/${encodeURIComponent(id)}`),
  docUrl: (t: string, id: string) => call<{ url: string }>(`${t}/documents/${encodeURIComponent(id)}/url`),
  feedback: (t: string, id: string, rating: number, comments: string) => call<{ rating: number }>(`${t}/trips/${encodeURIComponent(id)}/feedback`, { method: 'POST', body: JSON.stringify({ rating, comments }) }),
};
