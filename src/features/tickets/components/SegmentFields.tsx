import { Field, TextInput } from '@/design-system';
import type { TicketMode } from '@/shared/contracts/tickets';

export interface SegmentDraft {
  carrierNumber: string; carrierName: string; fromCode: string; fromName: string; toCode: string; toName: string;
  departAt: string; arriveAt: string; travelClass: string; boardingPoint: string; droppingPoint: string; terminal: string; platform: string; baggage: string;
}
export const EMPTY_SEGMENT: SegmentDraft = { carrierNumber: '', carrierName: '', fromCode: '', fromName: '', toCode: '', toName: '', departAt: '', arriveAt: '', travelClass: '', boardingPoint: '', droppingPoint: '', terminal: '', platform: '', baggage: '' };

const NUMBER_LABEL: Record<TicketMode, string> = { FLIGHT: 'Flight no.', TRAIN: 'Train no.', BUS: 'Bus no.' };
const NAME_LABEL: Record<TicketMode, string> = { FLIGHT: 'Airline', TRAIN: 'Train name', BUS: 'Operator' };

/** One leg: number, from/to, times, and the mode-specific details (terminal, platform, boarding/dropping points). */
export function SegmentFields({ mode, value, onChange, errors, idPrefix }: { mode: TicketMode; value: SegmentDraft; onChange: (v: SegmentDraft) => void; errors?: Record<string, string>; idPrefix: string }) {
  const set = (k: keyof SegmentDraft) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  const f = (k: string) => errors?.[k];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Field label={NUMBER_LABEL[mode]} htmlFor={`${idPrefix}-num`}><TextInput id={`${idPrefix}-num`} value={value.carrierNumber} onChange={set('carrierNumber')} placeholder={mode === 'FLIGHT' ? '6E 2135' : mode === 'TRAIN' ? '15018' : ''} /></Field>
      <Field label={NAME_LABEL[mode]} htmlFor={`${idPrefix}-name`}><TextInput id={`${idPrefix}-name`} value={value.carrierName} onChange={set('carrierName')} /></Field>
      <Field label="From" htmlFor={`${idPrefix}-from`} required error={f('fromName')}><div className="flex gap-1"><TextInput aria-label="From code" className="w-20 uppercase" maxLength={10} placeholder={mode === 'FLIGHT' ? 'IXG' : mode === 'TRAIN' ? 'BGM' : ''} value={value.fromCode} onChange={set('fromCode')} /><TextInput id={`${idPrefix}-from`} value={value.fromName} onChange={set('fromName')} invalid={!!f('fromName')} /></div></Field>
      <Field label="To" htmlFor={`${idPrefix}-to`} required error={f('toName')}><div className="flex gap-1"><TextInput aria-label="To code" className="w-20 uppercase" maxLength={10} value={value.toCode} onChange={set('toCode')} /><TextInput id={`${idPrefix}-to`} value={value.toName} onChange={set('toName')} invalid={!!f('toName')} /></div></Field>
      <Field label="Departs (IST)" htmlFor={`${idPrefix}-dep`} error={f('departAt')}><TextInput id={`${idPrefix}-dep`} type="datetime-local" value={value.departAt} onChange={set('departAt')} /></Field>
      <Field label="Arrives (IST)" htmlFor={`${idPrefix}-arr`} error={f('arriveAt')}><TextInput id={`${idPrefix}-arr`} type="datetime-local" value={value.arriveAt} onChange={set('arriveAt')} /></Field>
      <Field label="Class" htmlFor={`${idPrefix}-cls`}><TextInput id={`${idPrefix}-cls`} value={value.travelClass} onChange={set('travelClass')} placeholder={mode === 'TRAIN' ? 'SL / 3A' : mode === 'FLIGHT' ? 'Economy' : 'Sleeper'} /></Field>
      {mode === 'FLIGHT'
        ? <><Field label="Terminal" htmlFor={`${idPrefix}-term`}><TextInput id={`${idPrefix}-term`} value={value.terminal} onChange={set('terminal')} /></Field><Field label="Baggage" htmlFor={`${idPrefix}-bag`}><TextInput id={`${idPrefix}-bag`} value={value.baggage} onChange={set('baggage')} placeholder="15 kg" /></Field></>
        : <>
          <Field label="Boarding point" htmlFor={`${idPrefix}-board`} className="col-span-2"><TextInput id={`${idPrefix}-board`} value={value.boardingPoint} onChange={set('boardingPoint')} /></Field>
          <Field label="Dropping point" htmlFor={`${idPrefix}-drop`} className="col-span-2"><TextInput id={`${idPrefix}-drop`} value={value.droppingPoint} onChange={set('droppingPoint')} /></Field>
          {mode === 'TRAIN' && <Field label="Platform" htmlFor={`${idPrefix}-pf`}><TextInput id={`${idPrefix}-pf`} value={value.platform} onChange={set('platform')} /></Field>}
        </>}
    </div>
  );
}
