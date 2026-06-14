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
import { RecordNumberBadge } from '@/shared/components/RecordNumberBadge';
import type { ItineraryStatus } from '@/shared/types';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { TEMPLATES } from './Itineraries';
import { DocumentActionBar } from '@/shared/components/documents/DocumentActionBar';

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
  const logCommunication  = useStore(s => s.logCommunication);
  const linkedTrip        = useStore(s => itinerary?.tripId ? s.trips.find(t => t.id === itinerary.tripId) : undefined);
  const linkedQuotation   = useStore(s => itinerary?.quotationId ? s.quotations.find(q => q.id === itinerary.quotationId) : undefined);
  const companySettings   = useStore(s => s.companySettings);

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
    logCommunication({
      type:       'whatsapp',
      recipient:  itinerary.customerPhone,
      subject:    `Itinerary ${itinerary.id} — ${itinerary.destination}`,
      entityType: 'itinerary',
      entityId:   itinerary.id,
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
    logCommunication({
      type:       'email',
      recipient:  itinerary.customerEmail,
      subject:    `Itinerary ${itinerary.id} — ${itinerary.destination}`,
      entityType: 'itinerary',
      entityId:   itinerary.id,
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
      <div className="p-5 pb-20 space-y-5 animate-fade-in print:hidden">

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
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => window.open(`/print/itinerary/${itinerary.id}`, '_blank')}>
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
                        className="block text-xs text-blue-600 hover:underline font-mono">
                        {linkedTrip.id}
                        <RecordNumberBadge label="Trip" n={linkedTrip.tripNumber} className="ml-1 text-blue-300" />
                      </button>
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

      <DocumentActionBar
        onPrint={() => window.open(`/print/itinerary/${itinerary.id}`, '_blank')}
        whatsappMessage={`Your itinerary for ${itinerary.destination} is ready! Trip: ${itinerary.id} | Dates: ${itinerary.startDate ? fmtDate(itinerary.startDate) : '—'} to ${itinerary.endDate ? fmtDate(itinerary.endDate) : '—'} | ${itinerary.pax} traveller(s). Contact GK Travels for any queries: ${companySettings?.phone ?? ''}`}
        customerPhone={itinerary.customerPhone ?? ''}
        customerEmail={itinerary.customerEmail}
        backLabel="Back to Itineraries"
        backHref="/itineraries"
        documentTitle={`Itinerary ${itinerary.id}`}
      />
    </>
  );
}
