import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, RefreshCw, Copy, Printer, Plane, Building2, Car, Camera, ArrowRight,
} from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { fmtDate } from '@/shared/utils/date';
import { getApiErrorMessage } from '@/shared/utils/error';
import { cn } from '@/shared/utils/cn';

// ─── Types ───────────────────────────────────────────────────

interface TripInfo {
  id:          string;
  destination: string;
  customer:    string;
  departure:   string | null;
  returnDate:  string | null;
  pax:         number;
}

interface ItineraryService {
  type:        string;
  time:        string;
  title:       string;
  description: string;
}

interface ItineraryDay {
  dayNumber: number;
  date:      string;
  heading:   string;
  narrative: string;
  services:  ItineraryService[];
}

interface GeneratedItinerary {
  title:       string;
  days:        ItineraryDay[];
  closingNote: string;
}

interface ItinerarySummary {
  summary:      string;
  highlights:   string[];
  duration:     string;
  destinations: string[];
}

type Style = 'detailed' | 'brief';

const TYPE_CONFIG: Record<string, { icon: React.ElementType; border: string; color: string }> = {
  FLIGHT:   { icon: Plane,     border: 'border-blue-400',   color: 'text-blue-500' },
  HOTEL:    { icon: Building2, border: 'border-green-400',  color: 'text-green-500' },
  VEHICLE:  { icon: Car,       border: 'border-amber-400',  color: 'text-amber-500' },
  ACTIVITY: { icon: Camera,    border: 'border-purple-400', color: 'text-purple-500' },
  TRANSFER: { icon: ArrowRight, border: 'border-gray-400',  color: 'text-gray-500' },
};

// ─── Component ──────────────────────────────────────────────

export default function AiItineraryBuilder() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();

  const [trip, setTrip]               = useState<TripInfo | null>(null);
  const [serviceCount, setServiceCount] = useState(0);
  const [tripError, setTripError]     = useState(false);

  const [itinerary, setItinerary]     = useState<GeneratedItinerary | null>(null);
  const [summary, setSummary]         = useState<ItinerarySummary | null>(null);
  const [style, setStyle]             = useState<Style>('detailed');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSummaryGenerating, setIsSummaryGenerating] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) return;
    (async () => {
      try {
        const [tripRes, servicesRes] = await Promise.all([
          apiClient.get(`/trips/${tripId}`),
          apiClient.get('/trip-services', { params: { tripId } }),
        ]);
        setTrip(tripRes.data as TripInfo);
        setServiceCount(Array.isArray(servicesRes.data) ? servicesRes.data.length : 0);
      } catch {
        setTripError(true);
      }
    })();
  }, [tripId]);

  const handleGenerate = useCallback(async () => {
    if (!tripId) return;
    setIsGenerating(true);
    setError(null);
    setItinerary(null);
    setSummary(null);
    try {
      const res = await apiClient.post('/ai/itinerary/generate', { tripId, style });
      setItinerary(res.data as GeneratedItinerary);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Generation failed'));
    } finally {
      setIsGenerating(false);
    }
  }, [tripId, style]);

  async function handleGenerateSummary() {
    if (!tripId) return;
    setIsSummaryGenerating(true);
    setSummaryError(null);
    try {
      const res = await apiClient.post('/ai/itinerary/summary', { tripId });
      setSummary(res.data as ItinerarySummary);
    } catch (err) {
      setSummaryError(getApiErrorMessage(err, 'Summary generation failed'));
    } finally {
      setIsSummaryGenerating(false);
    }
  }

  async function handleCopyPlainText() {
    if (!itinerary) return;
    const lines: string[] = [itinerary.title, ''];
    for (const day of itinerary.days) {
      lines.push(`Day ${day.dayNumber} — ${day.heading}`, day.date, '', day.narrative, '');
      for (const svc of day.services) {
        lines.push(`  • ${svc.time} — ${svc.title}`, `    ${svc.description}`);
      }
      lines.push('');
    }
    lines.push(itinerary.closingNote);
    await navigator.clipboard.writeText(lines.join('\n'));
  }

  return (
    <div className="flex h-full">
      {/* ── Left panel ─────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-gray-100 bg-white p-5 space-y-5 overflow-y-auto print:hidden">
        {tripError ? (
          <div className="text-sm text-red-600">Failed to load trip</div>
        ) : !trip ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-5 w-3/4 bg-gray-100 rounded" />
            <div className="h-4 w-1/2 bg-gray-100 rounded" />
            <div className="h-4 w-2/3 bg-gray-100 rounded" />
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-4 space-y-1.5">
            <p className="text-sm font-bold text-gray-900">{trip.destination}</p>
            <p className="text-xs text-gray-500">{trip.customer}</p>
            <p className="text-xs text-gray-500">{fmtDate(trip.departure)} → {fmtDate(trip.returnDate)}</p>
            <p className="text-xs text-gray-500">{trip.pax} passengers</p>
            <p className="text-xs text-gray-500">{serviceCount} services</p>
          </div>
        )}

        {/* Style selector */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-700">Itinerary Style</p>
          <div className="grid grid-cols-2 gap-2">
            {(['detailed', 'brief'] as Style[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStyle(s)}
                className={cn(
                  'py-2 rounded-xl text-xs font-semibold border capitalize transition-all',
                  style === s
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <div>
          <Button className="w-full" size="lg" loading={isGenerating} disabled={isGenerating || !trip} onClick={handleGenerate}>
            {isGenerating ? 'AI is writing...' : itinerary ? <><RefreshCw className="w-4 h-4" /> Regenerate</> : <><Sparkles className="w-4 h-4" /> Generate Itinerary</>}
          </Button>
          {isGenerating && <p className="text-[11px] text-gray-400 text-center mt-1.5">Usually takes 5–10 seconds</p>}
        </div>

        {/* Summary button + display */}
        {itinerary && (
          <div className="space-y-3">
            <Button variant="outline" className="w-full" loading={isSummaryGenerating} onClick={handleGenerateSummary}>
              {isSummaryGenerating ? 'Generating summary...' : 'Generate Summary'}
            </Button>

            {summaryError && <p className="text-xs text-red-600">{summaryError}</p>}

            {summary && (
              <div className="bg-indigo-50 rounded-2xl p-4 space-y-2">
                <p className="text-xs italic text-gray-700">{summary.summary}</p>
                <ul className="space-y-1">
                  {summary.highlights.map((h, i) => (
                    <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                      <span className="text-indigo-400">•</span>{h}
                    </li>
                  ))}
                </ul>
                <Badge variant="secondary">{summary.duration}</Badge>
                <div className="flex flex-wrap gap-1.5">
                  {summary.destinations.map(d => (
                    <Badge key={d} className="bg-white">{d}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Export buttons */}
        {itinerary && (
          <div className="grid grid-cols-1 gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopyPlainText}>
              <Copy className="w-3.5 h-3.5" /> Copy Plain Text
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </Button>
          </div>
        )}

        <button
          onClick={() => navigate(`/trips/${tripId}`)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Trip
        </button>
      </div>

      {/* ── Right panel ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 print:p-0">
        {!itinerary && !isGenerating && !error && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 print:hidden">
            <div className="w-32 h-32 rounded-2xl bg-gray-100" />
            <p className="text-sm font-semibold text-gray-700">Your itinerary will appear here</p>
            <p className="text-xs text-gray-400">Select a style and click Generate Itinerary</p>
          </div>
        )}

        {isGenerating && (
          <div className="space-y-4 print:hidden">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl shadow-sm p-5 space-y-3 animate-pulse">
                <div className="h-6 w-48 bg-gray-100 rounded" />
                <div className="h-16 w-full bg-gray-100 rounded" />
                <div className="h-10 w-full bg-gray-100 rounded" />
                <div className="h-10 w-full bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2 print:hidden">
            <p className="text-sm text-red-700">⚠️ {error}</p>
            {error.includes('no services') && (
              <button onClick={() => navigate(`/trips/${tripId}`)} className="text-xs text-red-700 underline">
                Go to trip page to add services
              </button>
            )}
            <Button size="sm" variant="outline" onClick={handleGenerate}>Try Again</Button>
          </div>
        )}

        {itinerary && (
          <div className="space-y-4 max-w-3xl mx-auto">
            {/* Cover */}
            <div className="bg-gray-50 rounded-2xl p-8 text-center space-y-1 print:bg-white">
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">GK Travels</p>
              <h1 className="text-2xl font-bold text-gray-900 font-display">{itinerary.title}</h1>
              {trip && <p className="text-sm text-gray-600">{trip.destination}</p>}
              {trip && (
                <p className="text-xs text-gray-500">
                  {fmtDate(trip.departure)} — {fmtDate(trip.returnDate)} · {trip.pax} Passengers
                </p>
              )}
            </div>

            {/* Days */}
            {itinerary.days.map((day, idx) => (
              <div
                key={day.dayNumber}
                className={cn('bg-white rounded-2xl shadow-sm overflow-hidden print:shadow-none', idx > 0 && 'print:break-before-page')}
              >
                <div className="bg-blue-50 px-5 py-3">
                  <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Day {day.dayNumber}</p>
                  <p className="text-base font-bold text-gray-900">{day.heading}</p>
                  <p className="text-xs text-gray-500">{day.date}</p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-sm italic text-gray-600">{day.narrative}</p>
                </div>
                <div className="px-5 py-3 space-y-3">
                  {day.services.map((svc, i) => {
                    const cfg = TYPE_CONFIG[svc.type] ?? TYPE_CONFIG.TRANSFER;
                    const Icon = cfg.icon;
                    return (
                      <div key={i} className={cn('flex gap-3 border-l-2 pl-3', cfg.border)}>
                        <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', cfg.color)} />
                        <div className="space-y-0.5">
                          <p className="text-[11px] text-gray-400">{svc.time}</p>
                          <p className="text-sm font-semibold text-gray-900">{svc.title}</p>
                          <p className="text-xs text-gray-500">{svc.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Closing note */}
            <div className="bg-gray-50 rounded-2xl p-6 text-center print:bg-white">
              <p className="text-sm italic text-gray-600">{itinerary.closingNote}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
