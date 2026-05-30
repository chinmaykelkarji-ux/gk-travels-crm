import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Save, Copy, CheckCircle,
  ChevronDown, ChevronUp, GripVertical, AlertCircle,
} from 'lucide-react';
import { useStore } from '@/store';
import apiClient from '@/lib/apiClient';
import type { ItineraryDay, ItineraryTemplate, MealType } from '@/shared/types';
import { today } from '@/shared/utils/date';
import { uid } from '@/shared/utils/id';
import { cn } from '@/shared/utils/cn';
import { toast } from '@/shared/hooks/useToast';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import { TEMPLATES } from './Itineraries';

// ─── Template day stubs ───────────────────────────────────────

function buildTemplateDays(template: ItineraryTemplate, destination: string, startDate?: string): BuilderDay[] {
  const meta = TEMPLATES.find(t => t.value === template)!;
  return Array.from({ length: meta.days }, (_, i) => {
    const d = startDate
      ? new Date(new Date(startDate).getTime() + i * 86_400_000).toISOString().split('T')[0]
      : undefined;

    const isFirst = i === 0;
    const isLast  = i === meta.days - 1;

    const base: Partial<BuilderDay> = {
      dayNumber: i + 1,
      date:      d,
      meals:     ['breakfast'],
      activities: [],
      sortOrder: i,
    };

    if (template === 'honeymoon') {
      return {
        ...base,
        title:     isFirst ? `Arrival — ${destination || 'Destination'}` : isLast ? `Departure` : `Day ${i + 1} — Romantic Exploration`,
        morning:   isFirst ? 'Arrive, freshen up, check in to your romantic hideaway' : 'Leisurely breakfast in bed / at the resort',
        afternoon: isFirst ? 'Welcome drink, explore the property' : 'Couple\'s spa treatment / poolside relaxation',
        evening:   isFirst ? 'Candlelight dinner at the beach / rooftop' : 'Sunset cruise / private dinner',
        meals:     ['breakfast', 'dinner'],
        activities: isFirst ? [] : ['Couple\'s spa', 'Sunset experience'],
        _tempId:   uid(),
      } as BuilderDay;
    }

    if (template === 'luxury') {
      return {
        ...base,
        title:     isFirst ? `Luxury Arrival — ${destination || 'Destination'}` : isLast ? `Departure` : `Day ${i + 1} — Premium Experience`,
        morning:   isFirst ? 'Private airport transfer, butler welcome, champagne check-in' : 'Gourmet breakfast with city views',
        afternoon: 'Private guided tour / exclusive experience',
        evening:   'Fine dining at award-winning restaurant',
        meals:     ['breakfast', 'lunch', 'dinner'],
        activities: ['Private guided experience'],
        _tempId:   uid(),
      } as BuilderDay;
    }

    if (template === 'family') {
      return {
        ...base,
        title:     isFirst ? `Family Arrival — ${destination || 'Destination'}` : isLast ? `Departure` : `Day ${i + 1} — Family Fun`,
        morning:   isFirst ? 'Arrive, hotel check-in, pool time' : 'Buffet breakfast, kids club',
        afternoon: 'Family-friendly sightseeing / theme park',
        evening:   'Family dinner, evening show',
        meals:     ['breakfast', 'lunch'],
        activities: ['Kids club', 'Family activity'],
        _tempId:   uid(),
      } as BuilderDay;
    }

    return {
      ...base,
      title:     isFirst ? `Arrival — ${destination || 'Destination'}` : isLast ? `Departure` : `Day ${i + 1} — Explore ${destination || 'Destination'}`,
      morning:   isFirst ? 'Arrive and check in' : 'Guided city tour',
      afternoon: 'Free time for leisure / local markets',
      evening:   'Dinner at a local restaurant',
      meals:     ['breakfast'],
      activities: [],
      _tempId:   uid(),
    } as BuilderDay;
  });
}

// ─── Local state type ─────────────────────────────────────────

interface BuilderDay extends ItineraryDay {
  _tempId: string;
}

function makeDay(dayNumber: number, destination: string, startDate?: string): BuilderDay {
  const date = startDate
    ? new Date(new Date(startDate).getTime() + (dayNumber - 1) * 86_400_000).toISOString().split('T')[0]
    : undefined;
  return {
    _tempId:   uid(),
    id:        '',
    itineraryId: '',
    dayNumber,
    date,
    title:     `Day ${dayNumber} — ${destination || 'Destination'}`,
    morning:   '',
    afternoon: '',
    evening:   '',
    hotelName: '',
    hotelAddress: '',
    meals:     [],
    transfers: '',
    activities: [],
    notes:     '',
    sortOrder: dayNumber - 1,
  };
}

// ─── Day Editor Card ──────────────────────────────────────────

interface DayCardProps {
  day:         BuilderDay;
  idx:         number;
  total:       number;
  vendors:     { id: string; name: string; type: string }[];
  onChange:    (tempId: string, field: keyof BuilderDay, value: unknown) => void;
  onRemove:    (tempId: string) => void;
  onDuplicate: (tempId: string) => void;
  onDragStart: (e: React.DragEvent, idx: number) => void;
  onDragOver:  (e: React.DragEvent) => void;
  onDrop:      (e: React.DragEvent, idx: number) => void;
}

function DayCard({ day, idx, total, vendors, onChange, onRemove, onDuplicate, onDragStart, onDragOver, onDrop }: DayCardProps) {
  const [open, setOpen] = useState(true);
  const hotelVendors = vendors.filter(v => v.type === 'hotel');
  const meals: MealType[] = ['breakfast', 'lunch', 'dinner'];

  const toggleMeal = (m: MealType) => {
    const current = day.meals ?? [];
    onChange(day._tempId, 'meals',
      current.includes(m) ? current.filter(x => x !== m) : [...current, m]
    );
  };

  const addActivity = () => onChange(day._tempId, 'activities', [...(day.activities ?? []), '']);
  const updateActivity = (i: number, val: string) => {
    const next = [...(day.activities ?? [])];
    next[i] = val;
    onChange(day._tempId, 'activities', next);
  };
  const removeActivity = (i: number) => {
    const next = [...(day.activities ?? [])].filter((_, j) => j !== i);
    onChange(day._tempId, 'activities', next);
  };

  return (
    <div
      className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all"
      draggable
      onDragStart={e => onDragStart(e, idx)}
      onDragOver={onDragOver}
      onDrop={e => onDrop(e, idx)}
    >
      {/* Day header */}
      <div
        className={cn(
          'flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 cursor-pointer select-none',
          open ? 'bg-indigo-50/50' : 'bg-gray-50'
        )}
        onClick={() => setOpen(o => !o)}
      >
        <div className="text-gray-300 cursor-grab active:cursor-grabbing" onClick={e => e.stopPropagation()}>
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {day.dayNumber}
        </div>
        <div className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
          <input
            type="text"
            value={day.title}
            onChange={e => onChange(day._tempId, 'title', e.target.value)}
            placeholder={`Day ${day.dayNumber} title…`}
            className="w-full bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-400"
          />
        </div>
        {day.date && <span className="text-xs text-gray-400 flex-shrink-0">{day.date}</span>}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => onDuplicate(day._tempId)}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors" title="Duplicate day">
            <Copy className="w-3.5 h-3.5" />
          </button>
          {total > 1 && (
            <button onClick={() => onRemove(day._tempId)}
              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Delete day">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {/* Day body */}
      {open && (
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Left: Time slots */}
          <div className="space-y-4">
            {(['morning', 'afternoon', 'evening'] as const).map(slot => (
              <div key={slot} className="space-y-1.5">
                <Label htmlFor={`${day._tempId}-${slot}`} className="capitalize text-xs">
                  {slot === 'morning' ? '🌅' : slot === 'afternoon' ? '☀️' : '🌙'} {slot}
                </Label>
                <textarea
                  id={`${day._tempId}-${slot}`}
                  rows={2}
                  value={day[slot] ?? ''}
                  onChange={e => onChange(day._tempId, slot, e.target.value)}
                  placeholder={`${slot.charAt(0).toUpperCase() + slot.slice(1)} activities…`}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 resize-none placeholder:text-gray-400"
                />
              </div>
            ))}

            {/* Activities */}
            <div className="space-y-1.5">
              <Label className="text-xs">🎯 Activities</Label>
              <div className="space-y-1.5">
                {(day.activities ?? []).map((act, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={act}
                      onChange={e => updateActivity(i, e.target.value)}
                      placeholder={`Activity ${i + 1}…`}
                    />
                    <button onClick={() => removeActivity(i)}
                      className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 flex-shrink-0 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button onClick={addActivity}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add activity
                </button>
              </div>
            </div>
          </div>

          {/* Right: Hotel + Meals + Transfer */}
          <div className="space-y-4">
            {/* Hotel */}
            <div className="space-y-1.5">
              <Label htmlFor={`${day._tempId}-hotel`} className="text-xs">🏨 Hotel / Accommodation</Label>
              <select
                className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                value={day.hotelName ?? ''}
                onChange={e => onChange(day._tempId, 'hotelName', e.target.value)}
              >
                <option value="">— Select or type below —</option>
                {hotelVendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
              </select>
              <Input
                id={`${day._tempId}-hotel`}
                value={day.hotelName ?? ''}
                onChange={e => onChange(day._tempId, 'hotelName', e.target.value)}
                placeholder="Hotel name…"
              />
              <Input
                value={day.hotelAddress ?? ''}
                onChange={e => onChange(day._tempId, 'hotelAddress', e.target.value)}
                placeholder="Hotel address (optional)…"
              />
            </div>

            {/* Meals */}
            <div className="space-y-1.5">
              <Label className="text-xs">🍽️ Meals Included</Label>
              <div className="flex gap-2">
                {meals.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMeal(m)}
                    className={cn(
                      'flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all capitalize',
                      (day.meals ?? []).includes(m)
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    )}
                  >
                    {m === 'breakfast' ? '🌅 B' : m === 'lunch' ? '☀️ L' : '🌙 D'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400">
                {(day.meals ?? []).length === 0 ? 'No meals included' : (day.meals ?? []).map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(' · ')}
              </p>
            </div>

            {/* Transfers */}
            <div className="space-y-1.5">
              <Label htmlFor={`${day._tempId}-transfer`} className="text-xs">🚗 Transfer Details</Label>
              <textarea
                id={`${day._tempId}-transfer`}
                rows={2}
                value={day.transfers ?? ''}
                onChange={e => onChange(day._tempId, 'transfers', e.target.value)}
                placeholder="Transfer type, timing, vehicle…"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 resize-none placeholder:text-gray-400"
              />
            </div>

            {/* Day notes */}
            <div className="space-y-1.5">
              <Label htmlFor={`${day._tempId}-notes`} className="text-xs">📝 Day Notes</Label>
              <textarea
                id={`${day._tempId}-notes`}
                rows={2}
                value={day.notes ?? ''}
                onChange={e => onChange(day._tempId, 'notes', e.target.value)}
                placeholder="Special notes for this day…"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 resize-none placeholder:text-gray-400"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ItineraryBuilder ────────────────────────────────────

export default function ItineraryBuilder() {
  const navigate        = useNavigate();
  const { id }          = useParams<{ id: string }>();
  const [searchParams]  = useSearchParams();
  const isEdit          = !!id && id !== 'new';
  const templateParam   = searchParams.get('template') as ItineraryTemplate | null;
  const tripParam       = searchParams.get('tripId');
  const quotationParam  = searchParams.get('quotationId');

  const itineraries       = useStore(s => s.itineraries);
  const vendors           = useStore(s => s.vendors);
  const createItinerary   = useStore(s => s.createItinerary);
  const updateItinerary   = useStore(s => s.updateItinerary);

  const existing = isEdit ? itineraries.find(i => i.id === id) : null;

  // ── Header state ──────────────────────────────────────────

  const [title,            setTitle]            = useState('');
  const [destination,      setDestination]      = useState('');
  const [customerName,     setCustomerName]     = useState('');
  const [customerPhone,    setCustomerPhone]    = useState('');
  const [customerEmail,    setCustomerEmail]    = useState('');
  const [startDate,        setStartDate]        = useState('');
  const [endDate,          setEndDate]          = useState('');
  const [pax,              setPax]              = useState(1);
  const [notes,            setNotes]            = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [template,         setTemplate]         = useState<ItineraryTemplate | undefined>(templateParam ?? undefined);
  const [tripId,           setTripId]           = useState(tripParam ?? '');
  const [quotationId,      setQuotationId]      = useState(quotationParam ?? '');

  const [days,    setDays]    = useState<BuilderDay[]>([makeDay(1, '', '')]);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const dragIdx = useRef<number | null>(null);

  // ── Auto-fill from trip / quotation ──────────────────────

  useEffect(() => {
    async function autoFill() {
      if (tripParam) {
        setLoading(true);
        try {
          const res = await apiClient.get(`/itineraries/from-trip/${tripParam}`);
          const d   = res.data;
          setTitle(d.title ?? '');
          setDestination(d.destination ?? '');
          setCustomerName(d.customerName ?? '');
          setCustomerPhone(d.customerPhone ?? '');
          setCustomerEmail(d.customerEmail ?? '');
          setStartDate(d.startDate ?? '');
          setEndDate(d.endDate ?? '');
          setPax(d.pax ?? 1);
          setTripId(tripParam);
          if (d.days?.length) setDays(d.days.map((day: ItineraryDay) => ({ ...day, _tempId: uid() })));
        } catch { /* silently fail, user can fill manually */ }
        finally { setLoading(false); }
      } else if (quotationParam) {
        setLoading(true);
        try {
          const res = await apiClient.get(`/itineraries/from-quotation/${quotationParam}`);
          const d   = res.data;
          setTitle(d.title ?? '');
          setDestination(d.destination ?? '');
          setCustomerName(d.customerName ?? '');
          setCustomerPhone(d.customerPhone ?? '');
          setCustomerEmail(d.customerEmail ?? '');
          setStartDate(d.startDate ?? '');
          setEndDate(d.endDate ?? '');
          setPax(d.pax ?? 1);
          setQuotationId(quotationParam);
          if (d.days?.length) setDays(d.days.map((day: ItineraryDay) => ({ ...day, _tempId: uid() })));
        } catch {}
        finally { setLoading(false); }
      } else if (templateParam && !isEdit) {
        const templateDays = buildTemplateDays(templateParam, '', '');
        setDays(templateDays);
        setTemplate(templateParam);
      }
    }
    autoFill();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load existing on edit ─────────────────────────────────

  useEffect(() => {
    if (existing) {
      setTitle(existing.title ?? '');
      setDestination(existing.destination ?? '');
      setCustomerName(existing.customerName ?? '');
      setCustomerPhone(existing.customerPhone ?? '');
      setCustomerEmail(existing.customerEmail ?? '');
      setStartDate(existing.startDate ?? '');
      setEndDate(existing.endDate ?? '');
      setPax(existing.pax ?? 1);
      setNotes(existing.notes ?? '');
      setEmergencyContact(existing.emergencyContact ?? '');
      setTemplate(existing.template as ItineraryTemplate | undefined);
      setTripId(existing.tripId ?? '');
      setQuotationId(existing.quotationId ?? '');
      if (existing.days.length) {
        setDays(existing.days.map(d => ({ ...d, _tempId: d.id || uid() })));
      }
    }
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute day dates when startDate changes
  useEffect(() => {
    if (!startDate) return;
    setDays(prev => prev.map((d, i) => ({
      ...d,
      date: new Date(new Date(startDate).getTime() + i * 86_400_000).toISOString().split('T')[0],
      dayNumber: i + 1,
    })));
  }, [startDate]);

  // ── Day CRUD ──────────────────────────────────────────────

  const addDay = useCallback(() => {
    setDays(prev => {
      const next = [...prev, makeDay(prev.length + 1, destination, startDate)];
      return next.map((d, i) => ({ ...d, dayNumber: i + 1, sortOrder: i }));
    });
  }, [destination, startDate]);

  const removeDay = useCallback((tempId: string) => {
    setDays(prev => {
      const next = prev.filter(d => d._tempId !== tempId);
      return next.map((d, i) => ({ ...d, dayNumber: i + 1, sortOrder: i }));
    });
  }, []);

  const duplicateDay = useCallback((tempId: string) => {
    setDays(prev => {
      const idx  = prev.findIndex(d => d._tempId === tempId);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], _tempId: uid(), id: '' };
      const next = [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
      return next.map((d, i) => ({ ...d, dayNumber: i + 1, sortOrder: i }));
    });
  }, []);

  const updateDay = useCallback((tempId: string, field: keyof BuilderDay, value: unknown) => {
    setDays(prev => prev.map(d => d._tempId === tempId ? { ...d, [field]: value } : d));
  }, []);

  // ── Drag and Drop ─────────────────────────────────────────

  const handleDragStart  = useCallback((e: React.DragEvent, idx: number) => {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver   = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop       = useCallback((e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    const srcIdx = dragIdx.current;
    if (srcIdx === null || srcIdx === targetIdx) return;
    setDays(prev => {
      const next  = [...prev];
      const [item] = next.splice(srcIdx, 1);
      next.splice(targetIdx, 0, item);
      return next.map((d, i) => ({
        ...d,
        dayNumber: i + 1,
        sortOrder: i,
        date: startDate
          ? new Date(new Date(startDate).getTime() + i * 86_400_000).toISOString().split('T')[0]
          : d.date,
      }));
    });
    dragIdx.current = null;
  }, [startDate]);

  // ── Save ──────────────────────────────────────────────────

  async function handleSave(status: 'draft' | 'finalized' = existing?.status ?? 'draft') {
    setError('');
    if (!title.trim())        { setError('Itinerary title is required');  return; }
    if (!customerName.trim()) { setError('Customer name is required');    return; }
    if (!destination.trim())  { setError('Destination is required');      return; }

    setSaving(true);
    try {
      const payload = {
        tripId:          tripId     || undefined,
        quotationId:     quotationId || undefined,
        title, destination, customerName,
        customerPhone:   customerPhone   || undefined,
        customerEmail:   customerEmail   || undefined,
        startDate:       startDate || undefined,
        endDate:         endDate   || undefined,
        pax, notes: notes || undefined,
        emergencyContact: emergencyContact || undefined,
        template, status, createdDate: existing?.createdDate ?? today(),
        days: days.map(({ _tempId, id: dayId, itineraryId: _iid, ...d }) => ({
          ...d,
          id: dayId || undefined,
        })),
      };

      if (isEdit && existing) {
        updateItinerary(existing.id, payload as Parameters<typeof updateItinerary>[1]);
        toast.success('Itinerary updated');
        navigate(`/itineraries/${existing.id}`);
      } else {
        const it = createItinerary(payload as Parameters<typeof createItinerary>[0]);
        toast.success('Itinerary created', it.id);
        navigate(`/itineraries/${it.id}`);
      }
    } catch {
      toast.error('Failed to save itinerary');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const vendorList = vendors.filter(v => v.isActive).map(v => ({ id: v.id, name: v.name, type: v.type }));

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button onClick={() => navigate(isEdit ? `/itineraries/${id}` : '/itineraries')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {isEdit ? 'Back to Itinerary' : 'Back to Itineraries'}
        </button>
        <div className="flex items-center gap-2">
          {isEdit && existing?.status === 'draft' && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleSave('finalized')}>
              <CheckCircle className="w-3.5 h-3.5" /> Finalize
            </Button>
          )}
          <Button size="sm" loading={saving} className="gap-1.5" onClick={() => handleSave()}>
            <Save className="w-3.5 h-3.5" /> {isEdit ? 'Save Changes' : 'Save Draft'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Left: Header details */}
        <div className="xl:col-span-2 space-y-5">

          {/* Header card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Itinerary Details</h3>

            <div className="space-y-1.5">
              <Label htmlFor="ib-title" required>Itinerary Title</Label>
              <Input id="ib-title" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Rahul & Priya — Dubai Honeymoon 2025" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ib-cname" required>Customer Name</Label>
                <Input id="ib-cname" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Full name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ib-dest" required>Destination</Label>
                <Input id="ib-dest" value={destination} onChange={e => setDestination(e.target.value)} placeholder="Dubai, Bali…" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ib-phone">Customer Phone</Label>
                <Input id="ib-phone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ib-email">Customer Email</Label>
                <Input id="ib-email" type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="customer@email.com" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ib-start">Start Date</Label>
                <Input id="ib-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ib-end">End Date</Label>
                <Input id="ib-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ib-pax">Pax</Label>
                <Input id="ib-pax" type="number" min={1} value={pax} onChange={e => setPax(Number(e.target.value))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ib-emergency">Emergency Contact</Label>
              <Input id="ib-emergency" value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)}
                placeholder="Name · Phone · Relation" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ib-notes">General Notes</Label>
              <textarea
                id="ib-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Important travel info, visa requirements, health notes…"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 resize-none placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Day cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                Day-wise Itinerary
                <span className="ml-2 text-gray-400 font-normal">({days.length} day{days.length !== 1 ? 's' : ''})</span>
              </h3>
              <p className="text-[10px] text-gray-400">Drag ⠿ to reorder</p>
            </div>

            {days.map((day, idx) => (
              <DayCard
                key={day._tempId}
                day={day}
                idx={idx}
                total={days.length}
                vendors={vendorList}
                onChange={updateDay}
                onRemove={removeDay}
                onDuplicate={duplicateDay}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}

            <button
              onClick={addDay}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-indigo-400 hover:text-indigo-600 transition-all flex items-center justify-center gap-2 font-medium"
            >
              <Plus className="w-4 h-4" /> Add Day {days.length + 1}
            </button>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">

          {/* Summary */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 sticky top-5">
            <h3 className="text-sm font-semibold text-gray-800">Summary</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Destination</span><span className="font-medium text-gray-900">{destination || '—'}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Duration</span>
                <span className="font-medium text-gray-900">{days.length} day{days.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Pax</span><span className="font-medium text-gray-900">{pax}</span>
              </div>
              {template && (
                <div className="flex justify-between text-gray-600">
                  <span>Template</span>
                  <Badge variant="secondary" className="capitalize">{template}</Badge>
                </div>
              )}
            </div>

            {/* Day overview mini-list */}
            <div className="pt-3 border-t border-gray-100 space-y-1.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Days</p>
              {days.map(d => (
                <div key={d._tempId} className="flex items-center gap-2 text-xs text-gray-600">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                    {d.dayNumber}
                  </div>
                  <span className="truncate">{d.title}</span>
                </div>
              ))}
            </div>

            <Button className="w-full mt-2 gap-1.5" loading={saving} onClick={() => handleSave()}>
              <Save className="w-3.5 h-3.5" /> {isEdit ? 'Save Changes' : 'Save Draft'}
            </Button>
          </div>

          {/* Template selector */}
          {!isEdit && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Apply Template</h3>
              <div className="space-y-2">
                {TEMPLATES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setTemplate(t.value);
                      const built = buildTemplateDays(t.value, destination, startDate);
                      setDays(built);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-all text-left',
                      template === t.value
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    )}
                  >
                    <span className="text-lg">{t.emoji}</span>
                    <div>
                      <p className="text-xs font-semibold">{t.label}</p>
                      <p className="text-[10px] text-gray-400">{t.desc} · {t.days} days</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
