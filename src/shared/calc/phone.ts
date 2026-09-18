// Phone normalisation for duplicate detection. Indian numbers are the common
// case: "+91 98765 43210", "098765 43210" and "9876543210" must collide.
// Dependency-free so the server can import it.

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0091')) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.length >= 6 ? digits : null;
}

export function formatPhone(raw: string | null | undefined): string {
  const n = normalizePhone(raw);
  if (!n) return raw ?? '';
  if (n.length === 10) return `${n.slice(0, 5)} ${n.slice(5)}`;
  return n;
}
