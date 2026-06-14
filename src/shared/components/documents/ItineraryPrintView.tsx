import { fmtDate, fmtDateLong } from '@/shared/utils/date';
import { DocumentHeader } from './DocumentHeader';
import { DocumentFooter } from './DocumentFooter';
import { DOC_COLORS } from './theme';
import type { Itinerary, CompanySettings } from '@/shared/types';

const MEAL_LABEL: Record<string, string> = {
  breakfast: '🌅 Breakfast',
  lunch:     '☀️ Lunch',
  dinner:    '🌙 Dinner',
};

interface ItineraryPrintViewProps {
  itinerary: Itinerary;
  companySettings?: CompanySettings | null;
}

export function ItineraryPrintView({ itinerary, companySettings }: ItineraryPrintViewProps) {
  return (
    <div style={{ fontFamily: 'sans-serif', color: DOC_COLORS.textDark, fontSize: 12 }}>
      <DocumentHeader companySettings={companySettings} documentLabel="Itinerary" />

      {/* Cover section */}
      <div style={{ background: DOC_COLORS.primary, color: DOC_COLORS.white, padding: 20, borderRadius: 6, marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {itinerary.destination} TRAVEL ITINERARY
        </h1>
        <p style={{ fontSize: 12, marginTop: 8, fontWeight: 600 }}>
          {itinerary.customerName} | {itinerary.startDate ? fmtDate(itinerary.startDate) : '—'} → {itinerary.endDate ? fmtDate(itinerary.endDate) : '—'} | {itinerary.pax} traveller{itinerary.pax === 1 ? '' : 's'}
        </p>
        <p style={{ fontSize: 11, marginTop: 4, opacity: 0.9 }}>
          Trip Ref: {itinerary.tripId || '—'} | Itinerary: {itinerary.id}
        </p>
      </div>

      {/* Highlight pills */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {[
          { icon: '📅', label: `${itinerary.days.length} Day${itinerary.days.length === 1 ? '' : 's'}` },
          { icon: '🏨', label: `${new Set(itinerary.days.map(d => d.hotelName).filter(Boolean)).size} Hotel${new Set(itinerary.days.map(d => d.hotelName).filter(Boolean)).size === 1 ? '' : 's'}` },
          { icon: '✈️', label: `${itinerary.days.filter(d => /flight/i.test(d.transfers ?? '')).length} Flight${itinerary.days.filter(d => /flight/i.test(d.transfers ?? '')).length === 1 ? '' : 's'}` },
        ].map(pill => (
          <div key={pill.label} style={{ background: DOC_COLORS.white, border: `1px solid ${DOC_COLORS.primary}`, color: DOC_COLORS.primaryDark, borderRadius: 20, padding: '6px 14px', fontSize: 11, fontWeight: 600 }}>
            {pill.icon} {pill.label}
          </div>
        ))}
      </div>

      {/* Day cards */}
      <div>
        {itinerary.days.map((day, idx) => (
          <div key={day.id || idx} className="page-break-avoid" style={{ border: `1px solid ${DOC_COLORS.border}`, borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
            {/* Day header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: DOC_COLORS.primaryLight, borderLeft: `4px solid ${DOC_COLORS.primary}` }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: DOC_COLORS.primary, color: DOC_COLORS.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
                {day.dayNumber}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Day {day.dayNumber} — {day.title}</h3>
              </div>
              {day.date && <div style={{ fontSize: 11, color: DOC_COLORS.textMedium, fontWeight: 600 }}>{fmtDateLong(day.date)}</div>}
            </div>

            {/* Two-column body */}
            <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', gap: 16, padding: 16 }}>
              {/* Left: schedule */}
              <div>
                {[
                  { label: 'MORNING',   emoji: '🌅', value: day.morning   },
                  { label: 'AFTERNOON', emoji: '☀️', value: day.afternoon },
                  { label: 'EVENING',   emoji: '🌙', value: day.evening   },
                ].filter(s => s.value).map(slot => (
                  <div key={slot.label} style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
                      {slot.emoji} {slot.label}
                    </p>
                    <p style={{ fontSize: 12, lineHeight: 1.6, color: DOC_COLORS.textMedium, whiteSpace: 'pre-wrap', margin: 0 }}>{slot.value}</p>
                  </div>
                ))}
                {(day.activities ?? []).filter(Boolean).length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>🎯 ACTIVITIES</p>
                    <ul style={{ paddingLeft: 16, margin: 0 }}>
                      {(day.activities ?? []).filter(Boolean).map((act, i) => (
                        <li key={i} style={{ fontSize: 12, color: DOC_COLORS.textMedium, marginBottom: 2 }}>{act}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {day.notes && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>📝 NOTES</p>
                    <p style={{ fontSize: 11, fontStyle: 'italic', color: DOC_COLORS.textMedium, whiteSpace: 'pre-wrap', margin: 0 }}>{day.notes}</p>
                  </div>
                )}
              </div>

              {/* Right: logistics */}
              <div style={{ background: DOC_COLORS.primaryLight, borderRadius: 8, padding: 12 }}>
                {day.hotelName ? (
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>🏨 ACCOMMODATION</p>
                    <p style={{ fontSize: 12, fontWeight: 700, color: DOC_COLORS.textDark, margin: 0 }}>{day.hotelName}</p>
                    {day.hotelAddress && <p style={{ fontSize: 10, color: DOC_COLORS.textLight, marginTop: 2 }}>{day.hotelAddress}</p>}
                  </div>
                ) : null}

                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>🍽️ MEALS INCLUDED</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(['breakfast', 'lunch', 'dinner'] as const).map(m => {
                      const included = (day.meals ?? []).includes(m);
                      return (
                        <span key={m} style={{
                          fontSize: 10, padding: '3px 8px', borderRadius: 12, fontWeight: 600,
                          ...(included
                            ? { background: DOC_COLORS.primary, color: DOC_COLORS.white }
                            : { background: 'transparent', color: DOC_COLORS.textLight, border: `1px solid ${DOC_COLORS.textLight}` }),
                        }}>
                          {MEAL_LABEL[m] ?? m}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {day.transfers && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>🚗 TRANSPORT</p>
                    <p style={{ fontSize: 11, color: DOC_COLORS.textMedium, whiteSpace: 'pre-wrap', margin: 0 }}>{day.transfers}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Dotted separator */}
            <div style={{ borderTop: `1px dotted ${DOC_COLORS.border}` }} />
          </div>
        ))}
      </div>

      {/* General notes */}
      {itinerary.notes && (
        <div className="page-break-avoid" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>General Notes</p>
          <p style={{ fontSize: 12, color: DOC_COLORS.textMedium, lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{itinerary.notes}</p>
        </div>
      )}

      {/* Emergency contact */}
      {itinerary.emergencyContact && (
        <div className="page-break-avoid" style={{ background: DOC_COLORS.primaryLight, border: `1px solid ${DOC_COLORS.border}`, borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: DOC_COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>🚨 Emergency Contact</p>
          <p style={{ fontSize: 12, color: DOC_COLORS.textDark, margin: 0 }}>{itinerary.emergencyContact}</p>
        </div>
      )}

      <DocumentFooter companySettings={companySettings} generatedOn={fmtDate(new Date().toISOString())} />
    </div>
  );
}
