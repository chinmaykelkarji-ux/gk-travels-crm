// ─── Deterministic ID generators ────────────────────────────
// Mirror legacy GKData ID formats for localStorage compatibility.

function maxSeq(ids: string[], prefix: string, parts: number): number {
  return ids.reduce((max, id) => {
    const seg = (id || '').split('-')[parts];
    const n   = parseInt(seg, 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
}

export function nextTripId(existingIds: string[]): string {
  const year = new Date().getFullYear();
  const seq  = maxSeq(existingIds, 'GK', 2) + 1;
  return `GK-${year}-${String(seq).padStart(4, '0')}`;
}

export function nextLeadId(existingIds: string[]): string {
  const year = new Date().getFullYear();
  const seq  = maxSeq(existingIds, 'L', 2) + 1;
  return `L-${year}-${String(seq).padStart(4, '0')}`;
}

export function nextCustomerId(existingIds: string[]): string {
  const year = new Date().getFullYear();
  const seq  = maxSeq(existingIds, 'CUS', 2) + 1;
  return `CUS-${year}-${String(seq).padStart(4, '0')}`;
}

export function nextBookingId(existingIds: string[]): string {
  const year = new Date().getFullYear();
  const seq  = maxSeq(existingIds, 'BK', 2) + 1;
  return `BK-${year}-${String(seq).padStart(4, '0')}`;
}

export function nextTaskId(existingIds: string[]): string {
  const seq = existingIds.reduce((max, id) => {
    const n = parseInt((id || '').replace('T-', ''), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0) + 1;
  return `T-${String(seq).padStart(3, '0')}`;
}

export function nextPayId(prefix: 'PAY' | 'SP', existingIds: string[]): string {
  const seq = existingIds.reduce((max, id) => {
    const n = parseInt((id || '').split('-')[1], 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0) + 1;
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

// Five random characters collide often enough to matter: these ids become
// primary keys (invoices, activity rows), so uid() adds a per-process counter
// — unique within one process even inside the same millisecond — on top of
// proper randomness, which covers several processes.
let uidSeq = 0;

function randomChunk(): string {
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
  if (g.crypto?.getRandomValues) {
    const bytes = g.crypto.getRandomValues(new Uint8Array(6));
    return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('');
  }
  return `${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 8)}`;
}

export function uid(): string {
  uidSeq = (uidSeq + 1) % 1_679_616; // four base-36 characters
  return `${Date.now().toString(36)}-${uidSeq.toString(36).padStart(4, '0')}${randomChunk()}`;
}

export function reminderUid(): string {
  return `R-${uid()}`;
}

export function activityUid(): string {
  return `AL-${uid()}`;
}

export function nextVendorId(existingIds: string[]): string {
  const year = new Date().getFullYear();
  const seq  = maxSeq(existingIds, 'VEN', 2) + 1;
  return `VEN-${year}-${String(seq).padStart(4, '0')}`;
}

export function nextVendorPaymentId(existingIds: string[]): string {
  const year = new Date().getFullYear();
  const seq  = maxSeq(existingIds, 'VP', 2) + 1;
  return `VP-${year}-${String(seq).padStart(4, '0')}`;
}

export function nextQuotationId(existingIds: string[]): string {
  const year = new Date().getFullYear();
  const seq  = maxSeq(existingIds, 'Q', 2) + 1;
  return `Q-${year}-${String(seq).padStart(4, '0')}`;
}

export function nextItineraryId(existingIds: string[]): string {
  const year = new Date().getFullYear();
  const seq  = maxSeq(existingIds, 'ITN', 2) + 1;
  return `ITN-${year}-${String(seq).padStart(4, '0')}`;
}

export function nextVoucherId(existingIds: string[]): string {
  const year = new Date().getFullYear();
  const seq  = maxSeq(existingIds, 'VCH', 2) + 1;
  return `VCH-${year}-${String(seq).padStart(4, '0')}`;
}

export function nextReceivableId(existingIds: string[]): string {
  const year = new Date().getFullYear();
  const seq  = maxSeq(existingIds, 'REC', 2) + 1;
  return `REC-${year}-${String(seq).padStart(4, '0')}`;
}

export function nextReceivableEntryId(existingIds: string[]): string {
  const seq = existingIds.reduce((max, id) => {
    const n = parseInt((id || '').split('-')[1], 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0) + 1;
  return `RCE-${String(seq).padStart(3, '0')}`;
}

export function nextPassengerId(existingIds: string[]): string {
  const year = new Date().getFullYear();
  const seq  = maxSeq(existingIds, 'PAX', 2) + 1;
  return `PAX-${year}-${String(seq).padStart(4, '0')}`;
}
