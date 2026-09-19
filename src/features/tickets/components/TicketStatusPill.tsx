import { StatusPill, type Tone } from '@/design-system';
import { TICKET_STATUS_LABEL, type PassengerStatus, type TicketStatus } from '@/shared/contracts/tickets';

export const TICKET_TONE: Record<TicketStatus, Tone> = { REQUESTED: 'info', ON_HOLD: 'neutral', CONFIRMED: 'success', PARTIAL: 'warning', WAITLISTED: 'warning', RAC: 'warning', CANCELLED: 'danger' };
const PAX_TONE: Record<PassengerStatus, Tone> = { PENDING: 'neutral', CONFIRMED: 'success', WAITLISTED: 'warning', RAC: 'warning', CANCELLED: 'danger' };

export function TicketStatusPill({ status }: { status: TicketStatus }) {
  return <StatusPill tone={TICKET_TONE[status]}>{TICKET_STATUS_LABEL[status]}</StatusPill>;
}

export function PaxStatusPill({ status, position }: { status: PassengerStatus; position?: number | null }) {
  const label = status === 'WAITLISTED' ? `WL${position ? ` ${position}` : ''}` : status === 'RAC' ? `RAC${position ? ` ${position}` : ''}` : status === 'PENDING' ? 'to book' : status.toLowerCase();
  return <StatusPill tone={PAX_TONE[status]}>{label}</StatusPill>;
}
