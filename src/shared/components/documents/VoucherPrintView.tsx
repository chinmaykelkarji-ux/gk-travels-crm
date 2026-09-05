import { fmtDate } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import { calcVoucherPricing } from '@/shared/utils/finance';
import { DocumentHeader } from './DocumentHeader';
import { DocumentFooter } from './DocumentFooter';
import { DOC_COLORS } from './theme';
import { VOUCHER_TYPES } from '@/modules/vouchers/Vouchers';
import type { Voucher, CompanySettings, Trip } from '@/shared/types';

const MEAL_EMOJI: Record<string, string> = {
  'Room Only': '🛏', 'Bed & Breakfast': '🌅', 'Half Board': '☀️',
  'Full Board': '🍽', 'All Inclusive': '⭐',
};

const VOUCHER_BANNER: Record<string, { bg: string; label: string }> = {
  hotel:    { bg: '#065F46', label: 'HOTEL VOUCHER' },
  flight:   { bg: '#1E3A8A', label: 'FLIGHT VOUCHER' },
  transfer: { bg: '#92400E', label: 'VEHICLE VOUCHER' },
  activity: { bg: '#5B21B6', label: 'ACTIVITY VOUCHER' },
  visa:     { bg: '#115E59', label: 'VISA VOUCHER' },
  bus:      { bg: '#C2410C', label: 'BUS VOUCHER' },
};

const VOUCHER_IMPORTANT_NOTE: Record<string, string> = {
  hotel:    'Please present this voucher at check-in. Valid photo ID required.',
  flight:   'Report 2 hours before departure. Carry valid government ID.',
  transfer: 'Call driver 30 minutes before pickup time.',
  activity: 'Wear comfortable clothing. Carry this voucher.',
  visa:     'Carry your original passport and this voucher to the visa center.',
  bus:      'Reach the boarding point at least 30 minutes before departure. Carry valid photo ID.',
};

interface VoucherPrintViewProps {
  voucher: Voucher;
  companySettings?: CompanySettings | null;
  linkedTrip?: Trip;
}

export function VoucherPrintView({ voucher, companySettings, linkedTrip }: VoucherPrintViewProps) {
  const typeMeta = VOUCHER_TYPES.find(t => t.value === voucher.type);

  // Vouchers are handed to guests and suppliers, so pricing prints only when
  // explicitly enabled — and even then only the customer-facing amount.
  // Supplier cost and margin are never rendered here.
  const pricing     = calcVoucherPricing(voucher);
  const printPrice  = voucher.showPricing === true && pricing.totalPayable !== null;

  // QR code via free public API (works with internet access during print)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&bgcolor=ffffff&data=${encodeURIComponent(voucher.voucherNumber)}`;

  return (
    <div style={{ fontFamily: 'sans-serif', color: DOC_COLORS.textDark, fontSize: 12 }}>
      <DocumentHeader companySettings={companySettings} documentLabel="Service Voucher" />

      {/* Type banner */}
      <div style={{
        background: VOUCHER_BANNER[voucher.type]?.bg ?? DOC_COLORS.primary, color: '#fff',
        borderRadius: 6, padding: '12px 20px', marginBottom: 16, fontSize: 16, fontWeight: 700,
        letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 20 }}>{typeMeta?.emoji}</span>
        {VOUCHER_BANNER[voucher.type]?.label ?? `${typeMeta?.label?.toUpperCase() ?? ''} VOUCHER`}
      </div>

      {/* Two-column: guest details + service details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Guest details */}
        <div style={{ borderLeft: `4px solid ${DOC_COLORS.primary}`, background: DOC_COLORS.primaryLight, borderRadius: 6, padding: '12px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Guest Details</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{voucher.customerName}</div>
          {voucher.guestNames && <div style={{ fontSize: 12, color: DOC_COLORS.textMedium, marginTop: 4 }}>Guests: {voucher.guestNames}</div>}
          {voucher.customerPhone && <div style={{ fontSize: 12, color: DOC_COLORS.textMedium, marginTop: 2 }}>Contact: {voucher.customerPhone}</div>}
          {linkedTrip && <div style={{ fontSize: 12, color: DOC_COLORS.textMedium, marginTop: 2 }}>Trip Ref: {linkedTrip.id}</div>}
          <div style={{ fontSize: 12, color: DOC_COLORS.textMedium, marginTop: 2 }}>Voucher No: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{voucher.voucherNumber}</span></div>
          {voucher.issueDate && <div style={{ fontSize: 12, color: DOC_COLORS.textMedium, marginTop: 2 }}>Issue Date: {fmtDate(voucher.issueDate)}</div>}
        </div>

        {/* Service details */}
        <div style={{ border: `1px solid ${DOC_COLORS.border}`, borderRadius: 6, padding: '12px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Service Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {voucher.type === 'hotel' && (
              <>
                {voucher.hotelName      && renderField('Property', voucher.hotelName, true)}
                {voucher.hotelAddress   && renderField('Location', voucher.hotelAddress)}
                {voucher.checkIn        && renderField('Check-in', fmtDate(voucher.checkIn))}
                {voucher.checkOut       && renderField('Check-out', fmtDate(voucher.checkOut))}
                {voucher.checkIn && voucher.checkOut && renderField('Nights', String(Math.max(1, Math.round((new Date(voucher.checkOut).getTime() - new Date(voucher.checkIn).getTime()) / 86400000))))}
                {voucher.roomType       && renderField('Room Type', voucher.roomType)}
                {voucher.mealPlan       && renderField('Meal Plan', `${MEAL_EMOJI[voucher.mealPlan] ?? ''} ${voucher.mealPlan}`)}
                {voucher.confirmationNo && renderField('Confirmation No.', voucher.confirmationNo, true)}
              </>
            )}
            {voucher.type === 'flight' && (
              <>
                {(voucher.airline || voucher.flightNumber) && renderField('Airline / Flight', [voucher.airline, voucher.flightNumber].filter(Boolean).join(' '), true)}
                {(voucher.departure || voucher.arrival) && renderField('Route', `${voucher.departure || '—'} → ${voucher.arrival || '—'}`)}
                {voucher.departureDate && renderField('Departure Date', fmtDate(voucher.departureDate))}
                {voucher.arrivalDate   && renderField('Arrival Date', fmtDate(voucher.arrivalDate))}
                {voucher.pnr           && renderField('PNR', voucher.pnr, true)}
                {voucher.flightClass   && renderField('Class', voucher.flightClass)}
              </>
            )}
            {voucher.type === 'transfer' && (
              <>
                {voucher.vehicleType   && renderField('Vehicle Type', voucher.vehicleType)}
                {voucher.driverName    && renderField('Driver Name', voucher.driverName)}
                {voucher.driverPhone   && renderField('Driver Phone', voucher.driverPhone, true)}
                {voucher.pickupPoint   && renderField('Pickup', voucher.pickupPoint)}
                {voucher.dropPoint     && renderField('Drop', voucher.dropPoint)}
                {voucher.pickupDate    && renderField('Reporting Date', fmtDate(voucher.pickupDate))}
                {voucher.pickupTime    && renderField('Reporting Time', voucher.pickupTime)}
                {voucher.flightInfo    && renderField('Flight Info', voucher.flightInfo)}
              </>
            )}
            {voucher.type === 'activity' && (
              <>
                {voucher.activityName  && renderField('Activity', voucher.activityName, true)}
                {voucher.activityVenue && renderField('Location', voucher.activityVenue)}
                {voucher.activityDate  && renderField('Date', fmtDate(voucher.activityDate))}
                {voucher.activityTime  && renderField('Reporting Time', voucher.activityTime)}
                {voucher.activityNotes && <div style={{ gridColumn: '1 / -1' }}>{renderField('Notes', voucher.activityNotes)}</div>}
              </>
            )}
            {voucher.type === 'bus' && (
              <>
                {(voucher.operatorName || voucher.busType) && renderField('Operator / Type', [voucher.operatorName, voucher.busType].filter(Boolean).join(' · '), true)}
                {(voucher.fromLocation || voucher.toLocation) && renderField('Route', `${voucher.fromLocation || '—'} → ${voucher.toLocation || '—'}`)}
                {voucher.busNumber     && renderField('Bus Number', voucher.busNumber)}
                {voucher.pnr           && renderField('PNR / Ticket No', voucher.pnr, true)}
                {voucher.departure     && renderField('Departure', voucher.departure)}
                {voucher.arrival       && renderField('Arrival', voucher.arrival)}
                {voucher.duration      && renderField('Duration', voucher.duration)}
                {voucher.seatNumbers   && renderField('Seat Numbers', voucher.seatNumbers)}
                {voucher.boardingPoint && renderField('Boarding Point', voucher.boardingPoint)}
                {voucher.droppingPoint && renderField('Dropping Point', voucher.droppingPoint)}
                {voucher.reportingTime && renderField('Reporting Time', voucher.reportingTime)}
              </>
            )}
            {voucher.type === 'visa' && (
              <>
                {voucher.country   && renderField('Country', voucher.country, true)}
                {voucher.visaType  && renderField('Visa Type', voucher.visaType)}
                {voucher.entryType && renderField('Entry', voucher.entryType)}
                {voucher.validity  && renderField('Validity', voucher.validity)}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Supplier section */}
      {(voucher.vendorName || voucher.vendorPhone || voucher.vendorEmail) && (
        <div className="page-break-avoid" style={{ border: `1px solid ${DOC_COLORS.border}`, borderRadius: 6, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>To Be Presented To</div>
          {voucher.vendorName  && <div style={{ fontSize: 13, fontWeight: 700 }}>{voucher.vendorName}</div>}
          {voucher.vendorPhone && <div style={{ fontSize: 12, color: DOC_COLORS.textMedium, marginTop: 2 }}>{voucher.vendorPhone}</div>}
          {voucher.vendorEmail && <div style={{ fontSize: 12, color: DOC_COLORS.textMedium, marginTop: 2 }}>{voucher.vendorEmail}</div>}
        </div>
      )}

      {/* Payment details — printed only when showPricing is enabled */}
      {printPrice && (
        <div className="page-break-avoid" style={{ border: `1px solid ${DOC_COLORS.border}`, borderRadius: 6, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Payment Details</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {pricing.gstRate > 0 && (
                <>
                  <tr>
                    <td style={{ padding: '3px 0', color: DOC_COLORS.textMedium }}>Taxable Amount</td>
                    <td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(pricing.taxableAmount)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 0', color: DOC_COLORS.textMedium }}>GST @ {pricing.gstRate}%</td>
                    <td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(pricing.gstAmount)}</td>
                  </tr>
                </>
              )}
              <tr>
                <td style={{ padding: '6px 0 0', borderTop: `1px solid ${DOC_COLORS.border}`, fontWeight: 700 }}>Total Amount</td>
                <td style={{ padding: '6px 0 0', borderTop: `1px solid ${DOC_COLORS.border}`, textAlign: 'right', fontWeight: 700, fontSize: 14, color: DOC_COLORS.primary }}>
                  {formatCurrency(pricing.totalPayable)}
                </td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: 10, color: DOC_COLORS.textLight, margin: '8px 0 0' }}>
            This voucher confirms the service booking. It is not a tax invoice.
          </p>
        </div>
      )}

      {/* Important notes */}
      <div className="page-break-avoid" style={{ background: DOC_COLORS.primaryLight, border: `1px solid ${DOC_COLORS.border}`, borderRadius: 6, padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Important Notes</div>
        <p style={{ fontSize: 12, color: DOC_COLORS.textDark, margin: 0 }}>{VOUCHER_IMPORTANT_NOTE[voucher.type] ?? 'Please carry this voucher during travel.'}</p>
      </div>

      {/* Notes */}
      {voucher.notes && (
        <div className="page-break-avoid" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Notes</div>
          <p style={{ fontSize: 12, color: DOC_COLORS.textMedium, lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{voucher.notes}</p>
        </div>
      )}

      {/* Emergency */}
      {voucher.emergencyContact && (
        <div className="page-break-avoid" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#991B1B', marginBottom: 4 }}>🚨 Emergency Contact</div>
          <p style={{ fontSize: 13, color: '#7F1D1D', margin: 0 }}>{voucher.emergencyContact}</p>
        </div>
      )}

      {/* QR code */}
      <div className="page-break-avoid" style={{ textAlign: 'right', marginBottom: 8 }}>
        <img src={qrUrl} alt={voucher.voucherNumber} style={{ width: 80, height: 80, display: 'inline-block' }} />
        <div style={{ fontSize: 9, color: DOC_COLORS.textLight, marginTop: 4, fontFamily: 'monospace' }}>{voucher.voucherNumber}</div>
      </div>

      <DocumentFooter companySettings={companySettings} generatedOn={fmtDate(new Date().toISOString())} />
    </div>
  );
}

function renderField(label: string, value: string, emphasize = false) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: DOC_COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: emphasize ? DOC_COLORS.primary : DOC_COLORS.textDark, fontFamily: emphasize ? 'monospace' : undefined }}>{value}</div>
    </div>
  );
}

export function voucherSummary(voucher: Voucher): string {
  switch (voucher.type) {
    case 'hotel':    return voucher.hotelName ? `Hotel: ${voucher.hotelName}` : 'Hotel details confirmed';
    case 'flight':   return voucher.flightNumber ? `Flight: ${voucher.flightNumber}` : 'Flight details confirmed';
    case 'transfer': return [voucher.driverName, voucher.driverPhone].filter(Boolean).length
      ? `Driver: ${[voucher.driverName, voucher.driverPhone].filter(Boolean).join(', ')}`
      : 'Transfer details confirmed';
    case 'activity': return voucher.activityName ? `Activity: ${voucher.activityName}` : 'Activity details confirmed';
    case 'bus':      return voucher.operatorName ? `Bus: ${voucher.operatorName}` : 'Bus details confirmed';
    case 'visa':      return voucher.country ? `Visa for: ${voucher.country}` : 'Visa details confirmed';
    default:          return 'Details confirmed';
  }
}
