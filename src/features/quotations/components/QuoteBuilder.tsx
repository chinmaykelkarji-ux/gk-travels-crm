// Quotation builder: live totals from the shared calc, per-person bands,
// option groups, parties, GST. Everything is validated again on the server.
import { useMemo, useState } from 'react';
import { Plus, Trash2, Copy, AlertTriangle } from 'lucide-react';
import { Field, TextInput, Select, Textarea, Money, StatusPill } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { useStore } from '@/store';
import { computeQuote, type ItemInput as CalcItem, type PricingBasis, type GstMode } from '@/shared/calc/quotation';
import { QuoteCreate, type QuoteUpdate } from '@/shared/contracts/quotations';
import type { Quote } from '../api';
import { ApiError } from '@/lib/api';

const SERVICE_TYPES = ['FLIGHT', 'BUS', 'HOTEL', 'VEHICLE', 'ACTIVITY', 'TRANSFER', 'VISA', 'INSURANCE', 'OTHER'] as const;
const BASES: { value: PricingBasis; label: string }[] = [{ value: 'PER_PERSON', label: 'Per person' }, { value: 'PER_UNIT', label: 'Per unit' }, { value: 'PER_ROOM', label: 'Per room / night' }, { value: 'PER_GROUP', label: 'Whole group' }];
const BANDS = ['ADULT', 'CHILD', 'INFANT'] as const;
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

interface RateRow { band: 'ADULT' | 'CHILD' | 'INFANT'; count: number; costPrice: number; sellPrice: number }
interface ItemRow { key: string; serviceType: string; description: string; supplierId: string | null; pricingBasis: PricingBasis; costPrice: number; sellPrice: number; quantity: number; nights: number | null; serviceDate: string | null; taxRate: number | null; rates: RateRow[]; optionGroupKey: string | null; isSelectedOption: boolean; partyKey: string | null; customerNote: string | null; internalNote: string | null }
interface GroupRow { key: string; name: string }
interface PartyRow { key: string; name: string; adults: number; children: number; infants: number }
export interface BuilderState {
  title: string; validUntil: string; adults: number; children: number; infants: number; gstMode: GstMode; gstRate: number; discountAmount: number;
  notes: string; termsConditions: string; inclusions: string; exclusions: string; paymentPolicy: string; cancellationPolicy: string;
  items: ItemRow[]; optionGroups: GroupRow[]; parties: PartyRow[];
}

const emptyRates = (adults: number, children: number, infants: number): RateRow[] => [{ band: 'ADULT', count: adults, costPrice: 0, sellPrice: 0 }, { band: 'CHILD', count: children, costPrice: 0, sellPrice: 0 }, { band: 'INFANT', count: infants, costPrice: 0, sellPrice: 0 }];

export function stateFromQuote(q: Quote | null, defaults: { adults: number; children: number; infants: number; terms?: string | null }): BuilderState {
  if (!q) return { title: '', validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10), adults: defaults.adults, children: defaults.children, infants: defaults.infants, gstMode: 'EXCLUDED', gstRate: 5, discountAmount: 0, notes: '', termsConditions: defaults.terms ?? '', inclusions: '', exclusions: '', paymentPolicy: '', cancellationPolicy: '', items: [], optionGroups: [], parties: [] };
  const groupKey = new Map(q.optionGroups.map(g => [g.id, g.id])), partyKey = new Map(q.parties.map(p => [p.id, p.id]));
  return {
    title: q.title ?? '', validUntil: q.validUntil, adults: q.adults, children: q.children, infants: q.infants, gstMode: q.gstMode, gstRate: q.gstRate, discountAmount: q.discountAmount,
    notes: q.notes ?? '', termsConditions: q.termsConditions ?? '', inclusions: q.inclusions ?? '', exclusions: q.exclusions ?? '', paymentPolicy: q.paymentPolicy ?? '', cancellationPolicy: q.cancellationPolicy ?? '',
    optionGroups: q.optionGroups.map(g => ({ key: g.id, name: g.name })),
    parties: q.parties.map(p => ({ key: p.id, name: p.name, adults: p.adults, children: p.children, infants: p.infants })),
    items: q.items.map(i => ({ key: i.id, serviceType: i.serviceType, description: i.description, supplierId: i.supplierId, pricingBasis: i.pricingBasis, costPrice: i.costPrice, sellPrice: i.sellPrice, quantity: i.quantity, nights: i.nights, serviceDate: i.serviceDate, taxRate: i.taxRate, rates: i.rates.length ? i.rates : emptyRates(q.adults, q.children, q.infants), optionGroupKey: i.optionGroupId ? groupKey.get(i.optionGroupId) ?? null : null, isSelectedOption: i.isSelectedOption, partyKey: i.partyId ? partyKey.get(i.partyId) ?? null : null, customerNote: i.customerNote, internalNote: i.internalNote })),
  };
}

export function toPayload(s: BuilderState): QuoteUpdate {
  return {
    title: s.title || null, validUntil: s.validUntil || null, adults: s.adults, children: s.children, infants: s.infants, gstMode: s.gstMode, gstRate: s.gstRate, discountAmount: s.discountAmount,
    notes: s.notes || null, termsConditions: s.termsConditions || null, inclusions: s.inclusions || null, exclusions: s.exclusions || null, paymentPolicy: s.paymentPolicy || null, cancellationPolicy: s.cancellationPolicy || null,
    optionGroups: s.optionGroups, parties: s.parties.map(p => ({ ...p, travellerIds: [] })),
    items: s.items.map(i => ({ key: i.key, serviceType: i.serviceType as QuoteUpdate['items'][number]['serviceType'], description: i.description, supplierId: i.supplierId, pricingBasis: i.pricingBasis, costPrice: i.costPrice, sellPrice: i.sellPrice, quantity: i.quantity, nights: i.nights, serviceDate: i.serviceDate, taxRate: i.taxRate, rates: i.pricingBasis === 'PER_PERSON' ? i.rates.filter(r => r.count > 0) : [], optionGroupKey: i.optionGroupKey, isSelectedOption: i.optionGroupKey ? i.isSelectedOption : true, partyKey: i.partyKey, customerNote: i.customerNote, internalNote: i.internalNote, details: {} })),
  };
}

function toCalc(s: BuilderState): Parameters<typeof computeQuote>[0] {
  return {
    items: s.items.map<CalcItem>(i => ({ id: i.key, description: i.description, pricingBasis: i.pricingBasis, costPrice: i.costPrice, sellPrice: i.sellPrice, quantity: i.quantity, nights: i.nights, rates: i.rates, optionGroupId: i.optionGroupKey, isSelectedOption: i.isSelectedOption, partyId: i.partyKey, taxRate: i.taxRate })),
    parties: s.parties.map(p => ({ id: p.key, name: p.name, adults: p.adults, children: p.children, infants: p.infants })),
    discountAmount: s.discountAmount, gstMode: s.gstMode, gstRate: s.gstRate, adults: s.adults, children: s.children, infants: s.infants,
  };
}

const num = (v: string) => (v === '' ? 0 : Number(v));

export function QuoteBuilder({ initial, submitting, error, onSubmit, onCancel, submitLabel }: { initial: BuilderState; submitting: boolean; error?: ApiError | null; onSubmit: (p: QuoteUpdate) => void; onCancel: () => void; submitLabel: string }) {
  const [s, setS] = useState<BuilderState>(initial);
  const vendors = useStore(st => st.vendors);
  const totals = useMemo(() => computeQuote(toCalc(s)), [s]);
  const clientErrors = useMemo(() => { const r = QuoteCreate.safeParse({ enquiryId: 'x', ...toPayload(s) }); return r.success ? [] : r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`); }, [s]);
  const set = <K extends keyof BuilderState>(k: K, v: BuilderState[K]) => setS(prev => ({ ...prev, [k]: v }));
  const setItem = (key: string, patch: Partial<ItemRow>) => setS(prev => ({ ...prev, items: prev.items.map(i => (i.key === key ? { ...i, ...patch } : i)) }));
  const addItem = (partial: Partial<ItemRow> = {}) => setS(prev => ({ ...prev, items: [...prev.items, { key: uid(), serviceType: 'HOTEL', description: '', supplierId: null, pricingBasis: 'PER_UNIT', costPrice: 0, sellPrice: 0, quantity: 1, nights: null, serviceDate: null, taxRate: null, rates: emptyRates(prev.adults, prev.children, prev.infants), optionGroupKey: null, isSelectedOption: true, partyKey: null, customerNote: null, internalNote: null, ...partial }] }));
  const selectInGroup = (groupKey: string, itemKey: string) => setS(prev => ({ ...prev, items: prev.items.map(i => (i.optionGroupKey === groupKey ? { ...i, isSelectedOption: i.key === itemKey } : i)) }));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 px-5 py-4">
      <div className="space-y-5 min-w-0">
        {error && !error.fields && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">{error.message}</div>}
        {error?.fields && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2"><div className="font-medium">{error.message}</div>{Object.entries(error.fields).map(([k, v]) => <div key={k}>{k}: {v}</div>)}</div>}

        <section className="bg-white border border-slate-200 rounded-md p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Title" htmlFor="qTitle" className="col-span-2"><TextInput id="qTitle" value={s.title} onChange={e => set('title', e.target.value)} placeholder="Bali family package" /></Field>
          <Field label="Valid until" htmlFor="qValid"><TextInput id="qValid" type="date" value={s.validUntil} onChange={e => set('validUntil', e.target.value)} /></Field>
          <Field label="Discount (₹)" htmlFor="qDisc"><TextInput id="qDisc" type="number" min={0} value={s.discountAmount} onChange={e => set('discountAmount', num(e.target.value))} /></Field>
          <Field label="Adults" htmlFor="qA"><TextInput id="qA" type="number" min={1} value={s.adults} onChange={e => set('adults', num(e.target.value))} /></Field>
          <Field label="Children" htmlFor="qC"><TextInput id="qC" type="number" min={0} value={s.children} onChange={e => set('children', num(e.target.value))} /></Field>
          <Field label="Infants" htmlFor="qI"><TextInput id="qI" type="number" min={0} value={s.infants} onChange={e => set('infants', num(e.target.value))} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="GST" htmlFor="qGst"><Select id="qGst" value={s.gstMode} onChange={e => set('gstMode', e.target.value as GstMode)}><option value="EXCLUDED">Added on top</option><option value="INCLUDED">Included</option><option value="NONE">No GST</option></Select></Field>
            <Field label="Rate %" htmlFor="qRate"><TextInput id="qRate" type="number" min={0} max={100} step={0.5} value={s.gstRate} onChange={e => set('gstRate', num(e.target.value))} disabled={s.gstMode === 'NONE'} /></Field>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-md">
          <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100">
            <h2 className="text-sm font-medium text-slate-800">Items</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => set('optionGroups', [...s.optionGroups, { key: uid(), name: `Option group ${s.optionGroups.length + 1}` }])}>+ Option group</Button>
              <Button size="sm" variant="outline" onClick={() => set('parties', [...s.parties, { key: uid(), name: `Party ${s.parties.length + 1}`, adults: 2, children: 0, infants: 0 }])}>+ Party</Button>
              <Button size="sm" onClick={() => addItem()}><Plus className="w-4 h-4 mr-1" />Item</Button>
            </div>
          </header>
          {s.optionGroups.length > 0 && (
            <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap gap-2">
              {s.optionGroups.map(g => (
                <span key={g.key} className="inline-flex items-center gap-1 text-xs border border-slate-200 rounded px-2 py-1">
                  <input aria-label="Option group name" className="bg-transparent focus:outline-none w-32" value={g.name} onChange={e => set('optionGroups', s.optionGroups.map(x => (x.key === g.key ? { ...x, name: e.target.value } : x)))} />
                  <button type="button" aria-label="Remove group" onClick={() => setS(prev => ({ ...prev, optionGroups: prev.optionGroups.filter(x => x.key !== g.key), items: prev.items.map(i => (i.optionGroupKey === g.key ? { ...i, optionGroupKey: null, isSelectedOption: true } : i)) }))} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
          {s.parties.length > 0 && (
            <div className="px-4 py-2 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {s.parties.map(p => (
                <div key={p.key} className="flex items-center gap-2 text-xs border border-slate-200 rounded px-2 py-1">
                  <input aria-label="Party name" className="flex-1 min-w-0 bg-transparent focus:outline-none" value={p.name} onChange={e => set('parties', s.parties.map(x => (x.key === p.key ? { ...x, name: e.target.value } : x)))} />
                  {(['adults', 'children', 'infants'] as const).map(b => <label key={b} className="flex items-center gap-1 text-slate-500">{b[0].toUpperCase()}<input type="number" min={0} className="w-10 border border-slate-200 rounded px-1" value={p[b]} onChange={e => set('parties', s.parties.map(x => (x.key === p.key ? { ...x, [b]: num(e.target.value) } : x)))} /></label>)}
                  <button type="button" aria-label="Remove party" onClick={() => setS(prev => ({ ...prev, parties: prev.parties.filter(x => x.key !== p.key), items: prev.items.map(i => (i.partyKey === p.key ? { ...i, partyKey: null } : i)) }))} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="divide-y divide-slate-100">
            {s.items.length === 0 && <p className="text-sm text-slate-500 px-4 py-6 text-center">No items yet. Add hotels, flights, transfers, activities…</p>}
            {s.items.map((it, idx) => {
              const t = totals.items.find(x => x.id === it.key);
              return (
                <div key={it.key} className={`px-4 py-3 space-y-2 ${t && !t.included ? 'opacity-60' : ''}`}>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
                    <Field label={`#${idx + 1} Type`} htmlFor={`st-${it.key}`}><Select id={`st-${it.key}`} value={it.serviceType} onChange={e => setItem(it.key, { serviceType: e.target.value })}>{SERVICE_TYPES.map(x => <option key={x} value={x}>{x.charAt(0) + x.slice(1).toLowerCase()}</option>)}</Select></Field>
                    <Field label="Description" htmlFor={`d-${it.key}`} className="col-span-2 sm:col-span-3"><TextInput id={`d-${it.key}`} value={it.description} onChange={e => setItem(it.key, { description: e.target.value })} placeholder="IndiGo 6E-123 BLR→DPS, 2 rooms × 3 nights…" /></Field>
                    <Field label="Pricing" htmlFor={`pb-${it.key}`}><Select id={`pb-${it.key}`} value={it.pricingBasis} onChange={e => setItem(it.key, { pricingBasis: e.target.value as PricingBasis })}>{BASES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}</Select></Field>
                    <Field label="Supplier" htmlFor={`sup-${it.key}`}><Select id={`sup-${it.key}`} value={it.supplierId ?? ''} onChange={e => setItem(it.key, { supplierId: e.target.value || null })}><option value="">—</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
                  </div>
                  {it.pricingBasis === 'PER_PERSON' ? (
                    <div className="grid grid-cols-3 gap-2">
                      {BANDS.map(b => { const r = it.rates.find(x => x.band === b) ?? { band: b, count: 0, costPrice: 0, sellPrice: 0 }; const upd = (patch: Partial<RateRow>) => setItem(it.key, { rates: BANDS.map(bb => (bb === b ? { ...r, ...patch } : it.rates.find(x => x.band === bb) ?? { band: bb, count: 0, costPrice: 0, sellPrice: 0 })) }); return (
                        <div key={b} className="border border-slate-200 rounded px-2 py-1.5 text-xs space-y-1">
                          <div className="font-medium text-slate-600">{b.charAt(0) + b.slice(1).toLowerCase()}</div>
                          <div className="grid grid-cols-3 gap-1">
                            <label className="text-slate-500">× <input aria-label={`${b} count`} type="number" min={0} className="w-full border border-slate-200 rounded px-1" value={r.count} onChange={e => upd({ count: num(e.target.value) })} /></label>
                            <label className="text-slate-500">cost <input aria-label={`${b} cost`} type="number" min={0} className="w-full border border-slate-200 rounded px-1" value={r.costPrice} onChange={e => upd({ costPrice: num(e.target.value) })} /></label>
                            <label className="text-slate-500">sell <input aria-label={`${b} sell`} type="number" min={0} className="w-full border border-slate-200 rounded px-1" value={r.sellPrice} onChange={e => upd({ sellPrice: num(e.target.value) })} /></label>
                          </div>
                        </div>); })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      <Field label="Cost" htmlFor={`c-${it.key}`}><TextInput id={`c-${it.key}`} type="number" min={0} value={it.costPrice} onChange={e => setItem(it.key, { costPrice: num(e.target.value) })} /></Field>
                      <Field label="Sell" htmlFor={`s-${it.key}`}><TextInput id={`s-${it.key}`} type="number" min={0} value={it.sellPrice} onChange={e => setItem(it.key, { sellPrice: num(e.target.value) })} /></Field>
                      {it.pricingBasis !== 'PER_GROUP' && <Field label={it.pricingBasis === 'PER_ROOM' ? 'Rooms' : 'Qty'} htmlFor={`q-${it.key}`}><TextInput id={`q-${it.key}`} type="number" min={0} value={it.quantity} onChange={e => setItem(it.key, { quantity: num(e.target.value) })} /></Field>}
                      <Field label="Nights" htmlFor={`n-${it.key}`}><TextInput id={`n-${it.key}`} type="number" min={1} value={it.nights ?? ''} onChange={e => setItem(it.key, { nights: e.target.value === '' ? null : num(e.target.value) })} placeholder="—" /></Field>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {s.optionGroups.length > 0 && (
                      <label className="flex items-center gap-1 text-slate-600">Group
                        <select className="border border-slate-200 rounded px-1 py-0.5" value={it.optionGroupKey ?? ''} onChange={e => setItem(it.key, { optionGroupKey: e.target.value || null, isSelectedOption: e.target.value ? !s.items.some(x => x.optionGroupKey === e.target.value && x.isSelectedOption) : true })}><option value="">—</option>{s.optionGroups.map(g => <option key={g.key} value={g.key}>{g.name}</option>)}</select>
                      </label>
                    )}
                    {it.optionGroupKey && <label className="flex items-center gap-1 text-slate-600"><input type="radio" name={`sel-${it.optionGroupKey}`} checked={it.isSelectedOption} onChange={() => selectInGroup(it.optionGroupKey as string, it.key)} />selected option</label>}
                    {s.parties.length > 0 && (
                      <label className="flex items-center gap-1 text-slate-600">Party
                        <select className="border border-slate-200 rounded px-1 py-0.5" value={it.partyKey ?? ''} onChange={e => setItem(it.key, { partyKey: e.target.value || null })}><option value="">Shared</option>{s.parties.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select>
                      </label>
                    )}
                    <label className="flex items-center gap-1 text-slate-600">GST %<input type="number" min={0} max={100} className="w-14 border border-slate-200 rounded px-1 py-0.5" value={it.taxRate ?? ''} placeholder={String(s.gstRate)} onChange={e => setItem(it.key, { taxRate: e.target.value === '' ? null : num(e.target.value) })} /></label>
                    <input aria-label="Customer note" className="flex-1 min-w-[160px] border border-slate-200 rounded px-2 py-0.5" placeholder="Note shown to customer" value={it.customerNote ?? ''} onChange={e => setItem(it.key, { customerNote: e.target.value || null })} />
                    <input aria-label="Internal note" className="flex-1 min-w-[160px] border border-amber-200 bg-amber-50/40 rounded px-2 py-0.5" placeholder="Internal note (never shown)" value={it.internalNote ?? ''} onChange={e => setItem(it.key, { internalNote: e.target.value || null })} />
                    <span className="ml-auto tabular-nums text-slate-700">{t ? <><Money value={t.sell} /> <span className="text-slate-400">· cost <Money value={t.cost} muted /> · margin <span className={t.margin < 0 ? 'text-red-600' : 'text-emerald-700'}>{t.marginPct}%</span></span></> : null}</span>
                    <button type="button" aria-label="Duplicate item" onClick={() => addItem({ ...it, key: undefined as unknown as string, isSelectedOption: it.optionGroupKey ? false : true })} className="text-slate-400 hover:text-slate-700"><Copy className="w-3.5 h-3.5" /></button>
                    <button type="button" aria-label="Remove item" onClick={() => set('items', s.items.filter(x => x.key !== it.key))} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-md p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Inclusions" htmlFor="qInc"><Textarea id="qInc" rows={4} value={s.inclusions} onChange={e => set('inclusions', e.target.value)} placeholder="One per line" /></Field>
          <Field label="Exclusions" htmlFor="qExc"><Textarea id="qExc" rows={4} value={s.exclusions} onChange={e => set('exclusions', e.target.value)} placeholder="One per line" /></Field>
          <Field label="Payment policy" htmlFor="qPay"><Textarea id="qPay" rows={3} value={s.paymentPolicy} onChange={e => set('paymentPolicy', e.target.value)} placeholder="50% on confirmation, balance 15 days before departure" /></Field>
          <Field label="Cancellation policy" htmlFor="qCan"><Textarea id="qCan" rows={3} value={s.cancellationPolicy} onChange={e => set('cancellationPolicy', e.target.value)} /></Field>
          <Field label="Terms & conditions" htmlFor="qTerms" className="sm:col-span-2"><Textarea id="qTerms" rows={3} value={s.termsConditions} onChange={e => set('termsConditions', e.target.value)} /></Field>
          <Field label="Internal notes" htmlFor="qNotes" className="sm:col-span-2"><Textarea id="qNotes" rows={2} value={s.notes} onChange={e => set('notes', e.target.value)} /></Field>
        </section>
      </div>

      <aside className="space-y-3 xl:sticky xl:top-4 self-start">
        <section className="bg-white border border-slate-200 rounded-md p-4 text-sm space-y-1.5">
          <h2 className="text-sm font-medium text-slate-800 mb-2">Totals</h2>
          <Row label="Subtotal"><Money value={totals.subtotal} /></Row>
          {totals.discountAmount > 0 && <Row label="Discount">− <Money value={totals.discountAmount} /></Row>}
          {s.gstMode !== 'NONE' && <Row label={`GST ${s.gstMode === 'INCLUDED' ? '(included)' : ''}`}><Money value={totals.tax} /></Row>}
          <Row label="Customer pays" strong><Money value={totals.total} /></Row>
          {totals.perPerson !== null && <Row label={`Per person (${totals.pax} pax)`}><Money value={totals.perPerson} /></Row>}
          <div className="border-t border-slate-100 my-2" />
          <Row label="Supplier cost"><Money value={totals.cost} muted /></Row>
          <Row label="Margin"><span className={totals.margin < 0 ? 'text-red-600' : 'text-emerald-700'}><Money value={totals.margin} /> ({totals.marginPct}%)</span></Row>
          {totals.parties.length > 0 && (
            <div className="pt-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Per party</div>
              {totals.parties.map(p => <Row key={p.partyId} label={`${p.name} (${p.pax})`}><Money value={p.total} />{p.perPerson !== null && <span className="text-slate-400 text-xs"> · {p.perPerson}/pp</span>}</Row>)}
            </div>
          )}
          {totals.warnings.length > 0 && <ul className="pt-2 space-y-1">{totals.warnings.map((w, i) => <li key={i} className="text-xs text-amber-700 flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{w}</li>)}</ul>}
          {totals.margin < 0 && <StatusPill tone="danger">Needs admin approval</StatusPill>}
        </section>
        {clientErrors.length > 0 && <section className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800 space-y-0.5">{clientErrors.slice(0, 6).map((e, i) => <div key={i}>{e}</div>)}</section>}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button className="flex-1" loading={submitting} disabled={clientErrors.length > 0} onClick={() => onSubmit(toPayload(s))}>{submitLabel}</Button>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return <div className={`flex justify-between gap-2 ${strong ? 'font-semibold text-slate-900' : 'text-slate-700'}`}><span>{label}</span><span className="tabular-nums text-right">{children}</span></div>;
}
