// ─── Currency ────────────────────────────────────────────────

const INR = new Intl.NumberFormat('en-IN', {
  style:                 'currency',
  currency:              'INR',
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return INR.format(amount);
}

export function formatCurrencyShort(amount: number): string {
  if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(1)}Cr`;
  if (amount >= 1_00_000)    return `₹${(amount / 1_00_000).toFixed(1)}L`;
  if (amount >= 1_000)       return `₹${(amount / 1_000).toFixed(1)}K`;
  return `₹${amount}`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

// ─── Phone ───────────────────────────────────────────────────

export function formatPhone(phone: string | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return phone;
}

// ─── Truncate ────────────────────────────────────────────────

export function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

// ─── Initials ────────────────────────────────────────────────

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

// ─── Percentage ──────────────────────────────────────────────

export function formatPct(pct: number): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}
