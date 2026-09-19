// Small, dependency-free CSV reader for master-data imports (hotels, vehicles).
// Handles quoted fields, escaped quotes, CRLF, and a header row. Returns rows
// as objects keyed by normalised header (lower-case, spaces → underscores).

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[]; errors: string[] } {
  const errors: string[] = [];
  const lines = splitRecords(text.replace(/^﻿/, ''));
  if (lines.length === 0) return { headers: [], rows: [], errors: ['The file is empty'] };
  const headers = lines[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i];
    if (cells.every(c => c.trim() === '')) continue;
    if (cells.length > headers.length) errors.push(`Line ${i + 1}: ${cells.length} values for ${headers.length} columns`);
    const row: Record<string, string> = {};
    headers.forEach((h, k) => { row[h] = (cells[k] ?? '').trim(); });
    rows.push(row);
  }
  return { headers, rows, errors };
}

function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { cells.push(cur); cur = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { cells.push(cur); records.push(cells); cells = []; cur = ''; continue; }
    cur += ch;
  }
  if (cur !== '' || cells.length) { cells.push(cur); records.push(cells); }
  return records;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\r\n');
}
