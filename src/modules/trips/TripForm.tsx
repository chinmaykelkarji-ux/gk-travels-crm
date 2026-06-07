import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { tripFormSchema, type TripFormSchema } from '@/shared/schemas/trip';
import type { Trip } from '@/shared/types';
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

const TRIP_TYPES = [
  'Honeymoon Package', 'Family Vacation', 'Corporate Trip',
  'Group Tour', 'Solo Travel', 'Luxury Escape', 'Adventure Trip',
  'Pilgrimage', 'Leisure', 'Other',
];

interface TripFormProps {
  open:    boolean;
  onClose: () => void;
  onSubmit: (data: TripFormSchema) => void;
  defaultValues?: Partial<Trip>;
  loading?: boolean;
  title?: string;
}

export function TripForm({ open, onClose, onSubmit, defaultValues, loading, title = 'New Trip File' }: TripFormProps) {
  const {
    register, handleSubmit, formState: { errors }, reset, setValue, watch,
  } = useForm<TripFormSchema>({
    resolver:      zodResolver(tripFormSchema),
    defaultValues: {
      customer:    '',
      phone:       '',
      destination: '',
      pax:         1,
      departure:   '',
      returnDate:  '',
      type:        'Leisure',
      gstRate:     5,
      gstMode:     'EXCLUDED',
      notes:       '',
    },
  });

  const tripType = watch('type');

  useEffect(() => {
    if (!open) return;
    reset({
      customer:    defaultValues?.customer    ?? '',
      phone:       defaultValues?.phone       ?? '',
      destination: defaultValues?.destination ?? '',
      pax:         defaultValues?.pax         ?? 1,
      departure:   defaultValues?.departure   ?? '',
      returnDate:  defaultValues?.returnDate  ?? '',
      type:        defaultValues?.type        ?? 'Leisure',
      totalAmount: defaultValues?.totalAmount ?? undefined,
      gstRate:     defaultValues?.gstRate     ?? 5,
      gstMode:     defaultValues?.gstMode     ?? 'EXCLUDED',
      notes:       defaultValues?.notes       ?? '',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleClose() {
    reset();
    onClose();
  }

  // Inline error component
  function FieldError({ name }: { name: keyof typeof errors }) {
    const err = errors[name];
    if (!err) return null;
    return <p className="mt-1 text-xs text-red-500">{err.message as string}</p>;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <span className="text-blue-600 text-sm font-bold">T</span>
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogBody>
            {/* Customer + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="customer" required>Customer Name</Label>
                <Input
                  id="customer"
                  placeholder="Full name"
                  error={errors.customer?.message}
                  {...register('customer')}
                />
                <FieldError name="customer" />
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

            {/* Destination + Pax */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="destination" required>Destination</Label>
                <Input
                  id="destination"
                  placeholder="Dubai, Maldives, Bali…"
                  error={errors.destination?.message}
                  {...register('destination')}
                />
                <FieldError name="destination" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pax" required>No. of Pax</Label>
                <Input
                  id="pax"
                  type="number"
                  min={1}
                  placeholder="2"
                  error={errors.pax?.message}
                  {...register('pax', { valueAsNumber: true })}
                />
                <FieldError name="pax" />
              </div>
            </div>

            {/* Departure + Return */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="departure" required>Departure Date</Label>
                <Input
                  id="departure"
                  type="date"
                  error={errors.departure?.message}
                  {...register('departure')}
                />
                <FieldError name="departure" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="returnDate">Return Date</Label>
                <Input
                  id="returnDate"
                  type="date"
                  {...register('returnDate')}
                />
              </div>
            </div>

            {/* Trip Type */}
            <div className="space-y-1.5">
              <Label required>Trip Type</Label>
              <Select value={tripType} onValueChange={v => setValue('type', v)}>
                <SelectTrigger error={!!errors.type}>
                  <SelectValue placeholder="Select trip type" />
                </SelectTrigger>
                <SelectContent>
                  {TRIP_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError name="type" />
            </div>

            {/* Selling Price + GST */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="totalAmount">
                  Selling Price
                  <span className="ml-1 text-[10px] text-gray-400 font-normal">(optional at creation)</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <Input
                    id="totalAmount"
                    type="number"
                    min={0}
                    placeholder="0"
                    className="pl-6"
                    error={errors.totalAmount?.message}
                    {...register('totalAmount', { valueAsNumber: true, setValueAs: v => v === '' ? null : Number(v) })}
                  />
                </div>
                <FieldError name="totalAmount" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gstRate">GST Rate %</Label>
                <Select
                  value={String(watch('gstRate') ?? 5)}
                  onValueChange={v => setValue('gstRate', Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 5, 12, 18, 28].map(r => (
                      <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* GST Mode */}
            <div className="space-y-1.5">
              <Label htmlFor="gstMode">GST Mode</Label>
              <Select
                value={watch('gstMode') ?? 'EXCLUDED'}
                onValueChange={v => setValue('gstMode', v as 'INCLUDED' | 'EXCLUDED')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXCLUDED">GST Excluded — add GST on top of price</SelectItem>
                  <SelectItem value="INCLUDED">GST Included — price already includes GST</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Special requests, preferences…"
                rows={2}
                {...register('notes')}
              />
            </div>

            {/* Validation hint */}
            {Object.keys(errors).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-xs text-red-600 font-medium">
                  Please fix the errors above before submitting.
                </p>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={loading}>
              {title.startsWith('Edit') ? 'Save Changes' : 'Create Trip File'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
