import { BRAND } from '@/design-system/brand';
import { shortDate, type CustomerItinerary } from '@/shared/calc/itinerary';

const label = { fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: BRAND.gold, margin: '0 0 3px' };

/** The customer's itinerary in the GK Travels brand. Renders only the customer copy from the API. */
export function CustomerItineraryDocument({ c }: { c: CustomerItinerary }) {
  const nights = c.startDate && c.endDate ? Math.max(0, Math.round((Date.parse(c.endDate) - Date.parse(c.startDate)) / 86_400_000)) : null;
  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", color: BRAND.ink, fontSize: 12 }}>
      <header style={{ background: BRAND.navy, color: BRAND.white, padding: '20px 24px', borderRadius: 6, borderBottom: `4px solid ${BRAND.gold}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            {c.company.logoUrl ? <img src={c.company.logoUrl} alt={c.company.name} style={{ height: 40, marginBottom: 8 }} /> : <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.goldSoft, letterSpacing: '0.04em' }}>{c.company.name}</div>}
            <div style={{ fontSize: 11, opacity: 0.85 }}>{[c.company.address, c.company.phone, c.company.email].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, opacity: 0.85 }}>Itinerary {c.id}<br />Version {c.version}{c.tripRef ? <><br />Trip {c.tripRef}</> : null}</div>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '16px 0 4px', color: BRAND.white }}>{c.title}</h1>
        <div style={{ fontSize: 12, color: BRAND.goldSoft }}>
          Prepared for {c.travellerName} Ji
          {c.startDate && <> · {shortDate(c.startDate)}{c.endDate && c.endDate !== c.startDate ? ` – ${shortDate(c.endDate)}` : ''}{nights !== null ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}</>}
          {' · '}{c.pax} traveller{c.pax === 1 ? '' : 's'}
        </div>
      </header>

      {c.pickupPoints.length > 0 && (
        <section className="page-break-avoid" style={{ marginTop: 16, border: `1px solid ${BRAND.rule}`, borderRadius: 6, padding: 12, background: BRAND.goldLight }}>
          <p style={label}>Pickup points</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>{c.pickupPoints.map((p, i) => (
              <tr key={i} style={{ borderTop: i ? `1px solid ${BRAND.rule}` : undefined }}>
                <td style={{ padding: '4px 8px 4px 0', fontWeight: 600, color: BRAND.navy }}>{p.name}</td>
                <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{p.time ? `${shortDate(p.time.slice(0, 10))}, ${p.time.slice(11, 16)}` : 'Time to be confirmed'}</td>
                <td style={{ padding: '4px 8px', color: BRAND.muted }}>{[p.landmark, p.address].filter(Boolean).join(', ')}</td>
                <td style={{ padding: '4px 0 4px 8px', color: BRAND.muted, textAlign: 'right' }}>{[p.contactName, p.contactPhone].filter(Boolean).join(' · ')}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      <main style={{ marginTop: 16 }}>
        {c.days.map(d => (
          <article key={d.dayNumber} className="day-card page-break-avoid" style={{ border: `1px solid ${BRAND.rule}`, borderRadius: 6, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: BRAND.goldLight, borderLeft: `4px solid ${BRAND.navy}` }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: BRAND.navy, color: BRAND.goldSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>{d.dayNumber}</div>
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: BRAND.navy, flex: 1 }}>{d.title}</h2>
              {d.date && <div style={{ fontSize: 11, color: BRAND.muted, fontWeight: 600 }}>{shortDate(d.date)}</div>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 14, padding: 14 }}>
              <div>
                {d.items.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>{d.items.map((i, k) => (
                    <li key={k} style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                      <span style={{ width: 42, flexShrink: 0, fontWeight: 700, color: BRAND.navy, fontVariantNumeric: 'tabular-nums' }}>{i.time ?? ''}</span>
                      <span><span style={{ fontWeight: 600 }}>{i.title}</span>{i.details && <span style={{ display: 'block', color: BRAND.muted, fontSize: 11 }}>{i.details}</span>}</span>
                    </li>
                  ))}</ul>
                )}
                {([['Morning', d.morning], ['Afternoon', d.afternoon], ['Evening', d.evening]] as const).filter(([, v]) => v).map(([l, v]) => (
                  <div key={l} style={{ marginBottom: 8 }}><p style={label}>{l}</p><p style={{ margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{v}</p></div>
                ))}
                {d.notes && <p style={{ margin: 0, fontStyle: 'italic', color: BRAND.muted, whiteSpace: 'pre-wrap' }}>{d.notes}</p>}
              </div>
              <div style={{ borderLeft: `1px solid ${BRAND.rule}`, paddingLeft: 14 }}>
                <p style={label}>Stay</p>
                <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{d.hotelName ?? '—'}{d.hotelAddress && <span style={{ display: 'block', fontWeight: 400, fontSize: 11, color: BRAND.muted }}>{d.hotelAddress}</span>}</p>
                {d.meals.length > 0 && <><p style={label}>Meals included</p><p style={{ margin: '0 0 8px' }}>{d.meals.map(m => m[0].toUpperCase() + m.slice(1)).join(', ')}</p></>}
                {d.transfers && <><p style={label}>Transport</p><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{d.transfers}</p></>}
              </div>
            </div>
          </article>
        ))}
      </main>

      {(c.notes || c.emergencyContact) && (
        <section className="page-break-avoid" style={{ marginTop: 8, display: 'grid', gridTemplateColumns: c.notes && c.emergencyContact ? '2fr 1fr' : '1fr', gap: 12 }}>
          {c.notes && <div style={{ border: `1px solid ${BRAND.rule}`, borderRadius: 6, padding: 12 }}><p style={label}>Please note</p><p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{c.notes}</p></div>}
          {c.emergencyContact && <div style={{ border: `1px solid ${BRAND.navy}`, borderRadius: 6, padding: 12 }}><p style={label}>Emergency contact</p><p style={{ margin: 0, fontWeight: 600, color: BRAND.navy }}>{c.emergencyContact}</p></div>}
        </section>
      )}

      <footer style={{ marginTop: 20, paddingTop: 10, borderTop: `2px solid ${BRAND.gold}`, fontSize: 11, color: BRAND.muted, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>With warm regards, {c.company.name}{c.company.phone ? ` · ${c.company.phone}` : ''}{c.company.website ? ` · ${c.company.website}` : ''}</span>
        <span>Timings may change with transport and local schedules; we will keep you informed.</span>
      </footer>
    </div>
  );
}
