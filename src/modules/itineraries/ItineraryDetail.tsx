import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Trash2, Printer, CheckCircle,
  MapPin, Calendar, Users, Phone, Mail, AlertTriangle, MessageCircle,
} from 'lucide-react';
import { useStore, selectors } from '@/store';
import apiClient from '@/lib/apiClient';
import { fmtDate } from '@/shared/utils/date';
import { whatsapp, gmail } from '@/shared/utils/email';
import { cn } from '@/shared/utils/cn';
import type { ItineraryStatus } from '@/shared/types';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { TEMPLATES } from './Itineraries';

const MEAL_LABEL: Record<string, string> = {
  breakfast: '🌅 Breakfast',
  lunch:     '☀️ Lunch',
  dinner:    '🌙 Dinner',
};

export default function ItineraryDetail() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();

  const itinerary         = useStore(selectors.itineraryById(id ?? ''));
  const deleteItinerary   = useStore(s => s.deleteItinerary);
  const setItineraryStatus = useStore(s => s.setItineraryStatus);
  const linkedTrip        = useStore(s => itinerary?.tripId ? s.trips.find(t => t.id === itinerary.tripId) : undefined);
  const linkedQuotation   = useStore(s => itinerary?.quotationId ? s.quotations.find(q => q.id === itinerary.quotationId) : undefined);

  const [deleting, setDeleting] = useState(false);

  function handleWhatsApp() {
    if (!itinerary?.customerPhone) { toast.error('No phone number on this itinerary'); return; }
    whatsapp.itinerary({
      phone:        itinerary.customerPhone,
      customerName: itinerary.customerName,
      destination:  itinerary.destination,
      itineraryId:  itinerary.id,
      days:         itinerary.days.length,
      startDate:    itinerary.startDate,
      endDate:      itinerary.endDate,
      pax:          itinerary.pax,
    });
  }

  function handleEmail() {
    if (!itinerary?.customerEmail) { toast.error('No email address on this itinerary'); return; }
    gmail.itinerary({
      email:        itinerary.customerEmail,
      customerName: itinerary.customerName,
      destination:  itinerary.destination,
      itineraryId:  itinerary.id,
      days:         itinerary.days.length,
      startDate:    itinerary.startDate,
      endDate:      itinerary.endDate,
      pax:          itinerary.pax,
    });
  }

  if (!itinerary) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Itinerary not found.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/itineraries')} className="mt-3">
          ← Back to Itineraries
        </Button>
      </div>
    );
  }

  const tmpl = TEMPLATES.find(t => t.value === itinerary.template);
  const isFinalized = itinerary.status === 'finalized';

  async function handleDelete() {
    const ok = await confirm({
      title:        `Delete "${itinerary!.title}"?`,
      description:  'This will permanently delete this itinerary and all its days.',
      confirmLabel: 'Delete Itinerary',
      variant:      'destructive',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/itineraries/${itinerary!.id}`);
      deleteItinerary(itinerary!.id);
      toast.success('Itinerary deleted');
      navigate('/itineraries');
    } catch { toast.error('Failed to delete itinerary'); }
    finally { setDeleting(false); }
  }

  function handleStatusToggle() {
    const next: ItineraryStatus = isFinalized ? 'draft' : 'finalized';
    setItineraryStatus(itinerary!.id, next);
    toast.success(`Status → ${next}`);
  }

  return (
    <>
      {/* ── Screen view ─────────────────────────────────────── */}
      <div className="p-5 space-y-5 animate-fade-in print:hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button onClick={() => navigate('/itineraries')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Itineraries
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            {itinerary.customerPhone && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={handleWhatsApp}>
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </Button>
            )}
            {itinerary.customerEmail && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-[#EA4335] hover:bg-red-50" onClick={handleEmail}>
                <Mail className="w-3.5 h-3.5" /> Email
              </Button>
            )}
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => navigate(`/itineraries/${itinerary.id}/edit`)}>
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </Button>
            <Button
              size="sm"
              className={cn('gap-1.5', isFinalized ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700', 'text-white')}
              onClick={handleStatusToggle}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {isFinalized ? 'Revert to Draft' : 'Finalize'}
            </Button>
            <Button variant="destructive" size="sm" className="gap-1.5" loading={deleting} onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          </div>
        </div>

        {/* Hero card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className={cn(
            'px-6 py-5 border-b border-gray-100',
            isFinalized
              ? 'bg-gradient-to-r from-emerald-50 to-teal-50'
              : 'bg-gradient-to-r from-indigo-50/50 to-slate-50'
          )}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  {tmpl && <span className="text-2xl">{tmpl.emoji}</span>}
                  <span className="font-mono text-xs text-gray-400">{itinerary.id}</span>
                  <Badge variant={isFinalized ? 'success' : 'secondary'}>{itinerary.status}</Badge>
                </div>
                <h1 className="text-xl font-bold text-gray-900 font-display">{itinerary.title}</h1>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                  <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" />{itinerary.destination}</span>
                  {(itinerary.startDate || itinerary.endDate) && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {itinerary.startDate ? fmtDate(itinerary.startDate) : ''}
                      {itinerary.endDate ? ` → ${fmtDate(itinerary.endDate)}` : ''}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-gray-400" />{itinerary.pax} pax</span>
                  {itinerary.customerPhone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400" />{itinerary.customerPhone}</span>}
                  {itinerary.customerEmail && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-gray-400" />{itinerary.customerEmail}</span>}
                </div>
              </div>
              <div className="text-right space-y-1.5">
                <div className="text-2xl font-bold text-indigo-700 font-display">{itinerary.days.length} Days</div>
                {(linkedTrip || linkedQuotation) && (
                  <div className="space-y-1">
                    {linkedTrip && (
                      <button onClick={() => navigate(`/trips/${linkedTrip.id}`)}
                        className="block text-xs text-blue-600 hover:underline font-mono">{linkedTrip.id}</button>
                    )}
                    {linkedQuotation && (
                      <button onClick={() => navigate(`/quotations/${linkedQuotation.id}`)}
                        className="block text-xs text-violet-600 hover:underline font-mono">{linkedQuotation.quotationNumber}</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          {itinerary.emergencyContact && (
            <div className="px-6 py-3 bg-red-50 border-t border-red-100 text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <strong>Emergency:</strong> {itinerary.emergencyContact}
            </div>
          )}
        </div>

        {/* Day cards */}
        <div className="space-y-4">
          {itinerary.days.map((day, idx) => (
            <div key={day.id || idx} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Day header */}
              <div className="flex items-center gap-4 px-5 py-3.5 bg-indigo-600 text-white">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-base font-bold flex-shrink-0">
                  {day.dayNumber}
                </div>
                <div>
                  <h3 className="font-bold text-sm">{day.title}</h3>
                  {day.date && <p className="text-indigo-200 text-xs mt-0.5">{fmtDate(day.date)}</p>}
                </div>
                {(day.meals ?? []).length > 0 && (
                  <div className="ml-auto flex items-center gap-1">
                    {(day.meals ?? []).map(m => (
                      <span key={m} className="text-xs bg-white/20 px-2 py-0.5 rounded-full capitalize">{m.charAt(0).toUpperCase()}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Day body */}
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Left: schedule */}
                <div className="space-y-3">
                  {[
                    { label: '🌅 Morning',   value: day.morning   },
                    { label: '☀️ Afternoon', value: day.afternoon },
                    { label: '🌙 Evening',   value: day.evening   },
                  ].filter(s => s.value).map(slot => (
                    <div key={slot.label}>
                      <p className="text-xs font-semibold text-gray-500 mb-1">{slot.label}</p>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{slot.value}</p>
                    </div>
                  ))}
                  {(day.activities ?? []).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">🎯 Activities</p>
                      <ul className="space-y-1">
                        {(day.activities ?? []).filter(Boolean).map((act, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                            {act}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Right: logistics */}
                <div className="space-y-3">
                  {day.hotelName && (
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <p className="text-xs font-semibold text-gray-500 mb-1">🏨 Accommodation</p>
                      <p className="text-sm font-semibold text-gray-800">{day.hotelName}</p>
                      {day.hotelAddress && <p className="text-xs text-gray-500 mt-0.5">{day.hotelAddress}</p>}
                    </div>
                  )}
                  {(day.meals ?? []).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">🍽️ Meals Included</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(day.meals ?? []).map(m => (
                          <span key={m} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{MEAL_LABEL[m] ?? m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {day.transfers && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">🚗 Transfers</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{day.transfers}</p>
                    </div>
                  )}
                  {day.notes && (
                    <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                      <p className="text-xs font-semibold text-amber-600 mb-1">📝 Notes</p>
                      <p className="text-sm text-amber-800 whitespace-pre-wrap">{day.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {itinerary.notes && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-xs font-semibold text-gray-500 mb-2">GENERAL NOTES</p>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{itinerary.notes}</p>
          </div>
        )}
      </div>

      {/* ── PDF / Print View ─────────────────────────────────── */}
      <div className="hidden print:block">
        {/* Cover page */}
        <div style={{ minHeight: '297mm', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px', background: '#0F172A', color: 'white', pageBreakAfter: 'always' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, letterSpacing: '0.3em', color: '#94A3B8', marginBottom: 32, textTransform: 'uppercase' }}>GK Travels · Premium Itinerary</div>
            <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12, fontFamily: 'sans-serif', lineHeight: 1.2 }}>{itinerary.title}</h1>
            <p style={{ fontSize: 18, color: '#94A3B8', marginBottom: 40 }}>{itinerary.destination}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, maxWidth: 400, margin: '0 auto', textAlign: 'left' }}>
              {[
                { label: 'Guest', value: itinerary.customerName },
                { label: 'Pax',   value: String(itinerary.pax) },
                ...(itinerary.startDate ? [{ label: 'From', value: fmtDate(itinerary.startDate) }] : []),
                ...(itinerary.endDate   ? [{ label: 'To',   value: fmtDate(itinerary.endDate)   }] : []),
                { label: 'Duration', value: `${itinerary.days.length} Days` },
              ].map(item => (
                <div key={item.label}>
                  <p style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{item.label}</p>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{item.value}</p>
                </div>
              ))}
            </div>
            {itinerary.customerPhone && (
              <p style={{ marginTop: 40, color: '#64748B', fontSize: 12 }}>📞 {itinerary.customerPhone}</p>
            )}
          </div>
        </div>

        {/* Day pages */}
        {itinerary.days.map((day, idx) => (
          <div key={day.id || idx} style={{ padding: '24px 32px', pageBreakAfter: 'always', fontFamily: 'sans-serif' }}>
            {/* Day header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, borderBottom: '3px solid #4F46E5', paddingBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 24, background: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
                {day.dayNumber}
              </div>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{day.title}</h2>
                {day.date && <p style={{ fontSize: 12, color: '#6B7280', margin: '4px 0 0' }}>{fmtDate(day.date)}</p>}
              </div>
              {(day.meals ?? []).length > 0 && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  {(day.meals ?? []).map(m => (
                    <span key={m} style={{ fontSize: 11, background: '#EEF2FF', color: '#4F46E5', padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>
                      {MEAL_LABEL[m]?.replace(/[^\w ]/g, '') ?? m}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Two-column body */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              {/* Schedule */}
              <div>
                {[
                  { label: 'Morning',   emoji: '🌅', value: day.morning   },
                  { label: 'Afternoon', emoji: '☀️', value: day.afternoon },
                  { label: 'Evening',   emoji: '🌙', value: day.evening   },
                ].filter(s => s.value).map(slot => (
                  <div key={slot.label} style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                      {slot.emoji} {slot.label}
                    </p>
                    <p style={{ fontSize: 13, lineHeight: 1.6, color: '#374151', whiteSpace: 'pre-wrap' }}>{slot.value}</p>
                  </div>
                ))}
                {(day.activities ?? []).filter(Boolean).length > 0 && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>🎯 Activities</p>
                    <ul style={{ paddingLeft: 16, margin: 0 }}>
                      {(day.activities ?? []).filter(Boolean).map((act, i) => (
                        <li key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>{act}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Logistics */}
              <div>
                {day.hotelName && (
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>🏨 Accommodation</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{day.hotelName}</p>
                    {day.hotelAddress && <p style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{day.hotelAddress}</p>}
                  </div>
                )}
                {day.transfers && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>🚗 Transfers</p>
                    <p style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap' }}>{day.transfers}</p>
                  </div>
                )}
                {day.notes && (
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: 16 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>📝 Notes</p>
                    <p style={{ fontSize: 12, color: '#78350F', whiteSpace: 'pre-wrap' }}>{day.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Page footer */}
            <div style={{ marginTop: 24, borderTop: '1px solid #E5E7EB', paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9CA3AF' }}>
              <span>{itinerary.title}</span>
              <span>Day {day.dayNumber} of {itinerary.days.length}</span>
            </div>
          </div>
        ))}

        {/* Notes + Emergency page */}
        {(itinerary.notes || itinerary.emergencyContact) && (
          <div style={{ padding: '24px 32px', fontFamily: 'sans-serif' }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, borderBottom: '3px solid #4F46E5', paddingBottom: 12, marginBottom: 24 }}>
              Important Information
            </h2>
            {itinerary.emergencyContact && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 12, padding: 16, marginBottom: 24 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#991B1B', marginBottom: 8 }}>🚨 Emergency Contact</p>
                <p style={{ fontSize: 14, color: '#7F1D1D' }}>{itinerary.emergencyContact}</p>
              </div>
            )}
            {itinerary.notes && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>General Notes</p>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{itinerary.notes}</p>
              </div>
            )}
            <div style={{ marginTop: 48, textAlign: 'center', fontSize: 11, color: '#9CA3AF', borderTop: '1px solid #E5E7EB', paddingTop: 16 }}>
              <p>GK Travels · gktravels8249@gmail.com</p>
              <p style={{ marginTop: 4 }}>Thank you for choosing GK Travels. Wishing you a wonderful journey! ✈️</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
