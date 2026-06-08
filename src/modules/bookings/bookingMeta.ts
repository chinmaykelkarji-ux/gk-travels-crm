import {
  Plane, Hotel, Car, Train, Bus, Shield, Activity, Package,
} from 'lucide-react';
import type { BookingType, BookingStatus } from '@/shared/types';

export const TYPE_ICON: Record<BookingType, React.ElementType> = {
  flight:    Plane,
  hotel:     Hotel,
  cab:       Car,
  train:     Train,
  bus:       Bus,
  visa:      Shield,
  insurance: Shield,
  activity:  Activity,
  other:     Package,
};

export const TYPE_COLOR: Record<BookingType, string> = {
  flight:    'bg-blue-50 text-blue-600',
  hotel:     'bg-emerald-50 text-emerald-600',
  cab:       'bg-amber-50 text-amber-600',
  train:     'bg-violet-50 text-violet-600',
  bus:       'bg-indigo-50 text-indigo-600',
  visa:      'bg-orange-50 text-orange-600',
  insurance: 'bg-teal-50 text-teal-600',
  activity:  'bg-pink-50 text-pink-600',
  other:     'bg-gray-50 text-gray-500',
};

export const STATUS_CONFIG: Record<BookingStatus, { label: string; class: string }> = {
  pending:    { label: 'Pending',    class: 'bg-gray-100 text-gray-600'     },
  confirmed:  { label: 'Confirmed',  class: 'bg-blue-100 text-blue-700'     },
  issued:     { label: 'Issued',     class: 'bg-indigo-100 text-indigo-700' },
  submitted:  { label: 'Submitted',  class: 'bg-amber-100 text-amber-700'   },
  approved:   { label: 'Approved',   class: 'bg-emerald-100 text-emerald-700' },
  rejected:   { label: 'Rejected',   class: 'bg-red-100 text-red-600'       },
  checked_in: { label: 'Checked In', class: 'bg-teal-100 text-teal-700'     },
  departed:   { label: 'Departed',   class: 'bg-violet-100 text-violet-700' },
  completed:  { label: 'Completed',  class: 'bg-emerald-100 text-emerald-800' },
  cancelled:  { label: 'Cancelled',  class: 'bg-red-50 text-red-400'        },
};
