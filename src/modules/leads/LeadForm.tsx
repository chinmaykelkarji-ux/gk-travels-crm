import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { leadFormSchema, type LeadFormSchema } from '@/shared/schemas/lead';
import type { Lead } from '@/shared/types';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogBody,
} from '@/shared/components/ui/dialog';

const LEAD_SOURCES = [
  'Walk-in', 'Phone Enquiry', 'WhatsApp', 'Instagram', 'Facebook',
  'Google', 'Website', 'Referral', 'Email', 'Travel Fair', 'Other',
];

const TRIP_TYPES = [
  'Honeymoon', 'Family Vacation', 'Corporate', 'Group Tour',
  'Solo Travel', 'Luxury', 'Adventure', 'Pilgrimage', 'Other',
];

interface LeadFormProps {
  open:    boolean;
  onClose: () => void;
  onSubmit: (data: LeadFormSchema) => void;
  defaultValues?: Partial<Lead>;
  loading?: boolean;
  title?: string;
}

export function LeadForm({ open, onClose, onSubmit, defaultValues, loading, title = 'New Lead' }: LeadFormProps) {
  const {
    register, handleSubmit, formState: { errors }, reset, setValue, watch,
  } = useForm<LeadFormSchema>({
    resolver:      zodResolver(leadFormSchema),
    defaultValues: {
      name:        '',
      phone:       '',
      email:       '',
      source:      'Walk-in',
      destination: '',
      pax:         1,
      priority:    'medium',
      notes:       '',
    },
  });

  const source   = watch('source');
  const priority = watch('priority');

  useEffect(() => {
    if (!open) return;
    reset({
      name:         defaultValues?.name         ?? '',
      phone:        defaultValues?.phone        ?? '',
      email:        defaultValues?.email        ?? '',
      source:       defaultValues?.source       ?? 'Walk-in',
      destination:  defaultValues?.destination  ?? '',
      travelDate:   defaultValues?.travelDate   ?? '',
      pax:          defaultValues?.pax          ?? 1,
      budget:       defaultValues?.budget       ?? undefined,
      tripType:     defaultValues?.tripType     ?? '',
      priority:     defaultValues?.priority     ?? 'medium',
      notes:        defaultValues?.notes        ?? '',
      assignedTo:   defaultValues?.assignedTo   ?? '',
      followUpDate: defaultValues?.followUpDate ?? '',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleClose() { reset(); onClose(); }

  function FieldError({ name }: { name: keyof typeof errors }) {
    const err = errors[name];
    if (!err) return null;
    return <p className="mt-1 text-xs text-red-500">{err.message as string}</p>;
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogBody>
            {/* Name + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name" required>Full Name</Label>
                <Input
                  id="name"
                  placeholder="Full name"
                  error={errors.name?.message}
                  {...register('name')}
                />
                <FieldError name="name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" required>Phone</Label>
                <Input
                  id="phone"
                  placeholder="+91 98765 43210"
                  error={errors.phone?.message}
                  {...register('phone')}
                />
                <FieldError name="phone" />
              </div>
            </div>

            {/* Email + Source */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="email@example.com" {...register('email')} />
                <FieldError name="email" />
              </div>
              <div className="space-y-1.5">
                <Label required>Lead Source</Label>
                <Select value={source} onValueChange={v => setValue('source', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Destination + Travel Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="destination">Destination</Label>
                <Input id="destination" placeholder="Dubai, Bali, Paris…" {...register('destination')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="travelDate">Travel Date</Label>
                <Input id="travelDate" type="date" {...register('travelDate')} />
              </div>
            </div>

            {/* Pax + Budget + Trip Type */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pax">Pax</Label>
                <Input
                  id="pax"
                  type="number"
                  min={1}
                  placeholder="2"
                  {...register('pax', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="budget">Budget (₹)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <Input
                    id="budget"
                    type="number"
                    min={0}
                    placeholder="0"
                    className="pl-6"
                    {...register('budget', { valueAsNumber: true, setValueAs: v => v === '' ? null : Number(v) })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Trip Type</Label>
                <Select value={watch('tripType') ?? ''} onValueChange={v => setValue('tripType', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIP_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Priority + Follow-up + Assigned */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority ?? 'medium'} onValueChange={v => setValue('priority', v as LeadFormSchema['priority'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="followUpDate">Follow-up Date</Label>
                <Input id="followUpDate" type="date" {...register('followUpDate')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assignedTo">Assigned To</Label>
                <Input id="assignedTo" placeholder="Staff name" {...register('assignedTo')} />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" placeholder="Requirements, preferences, special requests…" rows={2} {...register('notes')} />
            </div>

            {Object.keys(errors).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-xs text-red-600 font-medium">Please fix the errors above before submitting.</p>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
            <Button type="submit" size="sm" loading={loading}>
              {title.startsWith('Edit') ? 'Save Changes' : 'Add Lead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
