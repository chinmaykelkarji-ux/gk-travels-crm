// Links that open the person's own WhatsApp or mail app with a message filled
// in. TravelOS sends nothing itself: the person reads it and presses send.
// Dependency-free so the server and the screen share it.
import { normalizePhone } from './phone.js';

/** wa.me wants the number with its country code and no symbols; Indian 10-digit numbers get 91. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const n = normalizePhone(phone);
  if (!n) return null;
  const withCode = n.length === 10 ? `91${n}` : n;
  return `https://wa.me/${withCode}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(email: string | null | undefined, subject: string | null, text: string): string | null {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  const q = [subject ? `subject=${encodeURIComponent(subject)}` : null, `body=${encodeURIComponent(text)}`].filter(Boolean).join('&');
  return `mailto:${email}?${q}`;
}
