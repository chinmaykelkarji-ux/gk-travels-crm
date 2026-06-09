import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Plus, Search, Edit2, Trash2, Shield, AlertTriangle,
  Phone, Globe, ChevronRight, User, X,
} from 'lucide-react';
import { useStore, selectors } from '@/store';
import type { Passenger } from '@/shared/types';
import { fmtDate, daysUntil, today } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Separator } from '@/shared/components/ui/separator';

const VISA_STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  none:     { label: 'None',     class: 'bg-gray-100 text-gray-500'        },
  applied:  { label: 'Applied',  class: 'bg-blue-100 text-blue-700'        },
  approved: { label: 'Approved', class: 'bg-emerald-100 text-emerald-700'  },
  rejected: { label: 'Rejected', class: 'bg-red-100 text-red-600'          },
  expired:  { label: 'Expired',  class: 'bg-red-50 text-red-400'           },
};

const GENDER_OPTIONS = ['Male', 'Female', 'Other'] as const;
const MEAL_OPTIONS   = ['No Preference', 'Vegetarian', 'Vegan', 'Jain', 'Halal', 'Kosher', 'BLML', 'AVML'] as const;
const SEAT_OPTIONS   = ['No Preference', 'Window', 'Aisle', 'Middle'] as const;

type FormData = Omit<Passenger, 'createdDate'>;

const EMPTY_FORM: FormData = {
  id: '',
  customerId:            undefined,
  firstName:             '',
  lastName:              '',
  displayName:           '',
  dateOfBirth:           '',
  nationality:           '',
  gender:                '',
  passportNumber:        '',
  passportIssueDate:     '',
  passportExpiry:        '',
  placeOfIssue:          '',
  visaStatus:            'none',
  visaExpiry:            '',
  visaCountry:           '',
  visaType:              '',
  frequentFlyerNumber:   '',
  mealPreference:        'No Preference',
  seatPreference:        'No Preference',
  emergencyContactName:  '',
  emergencyContactPhone: '',
  emergencyRelation:     '',
  notes:                 '',
};

function passengerToForm(p: Passenger): FormData {
  return {
    id:                    p.id,
    customerId:            p.customerId,
    firstName:             p.firstName             ?? '',
    lastName:              p.lastName              ?? '',
    displayName:           p.displayName           ?? '',
    dateOfBirth:           p.dateOfBirth           ?? '',
    nationality:           p.nationality           ?? '',
    gender:                p.gender                ?? '',
    passportNumber:        p.passportNumber        ?? '',
    passportIssueDate:     p.passportIssueDate     ?? '',
    passportExpiry:        p.passportExpiry        ?? '',
    placeOfIssue:          p.placeOfIssue          ?? '',
    visaStatus:            p.visaStatus            ?? 'none',
    visaExpiry:            p.visaExpiry            ?? '',
    visaCountry:           p.visaCountry           ?? '',
    visaType:              p.visaType              ?? '',
    frequentFlyerNumber:   p.frequentFlyerNumber   ?? '',
    mealPreference:        p.mealPreference        ?? 'No Preference',
    seatPreference:        p.seatPreference        ?? 'No Preference',
    emergencyContactName:  p.emergencyContactName  ?? '',
    emergencyContactPhone: p.emergencyContactPhone ?? '',
    emergencyRelation:     p.emergencyRelation     ?? '',
    notes:                 p.notes                 ?? '',
  };
}

function LabeledInput({
  label, value, onChange, type = 'text', placeholder, required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function LabeledSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: readonly string[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default function Passengers() {
  const navigate = useNavigate();
  const passengers      = useStore(s => s.passengers);
  const customers       = useStore(s => s.customers);
  const createPassenger = useStore(s => s.createPassenger);
  const updatePassenger = useStore(s => s.updatePassenger);
  const deletePassenger = useStore(s => s.deletePassenger);

  const [search,     setSearch]     = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId,     setEditId]     = useState<string | null>(null);
  const [form,       setForm]       = useState<FormData>(EMPTY_FORM);
  const [activeTab,  setActiveTab]  = useState<'personal' | 'passport' | 'visa' | 'travel' | 'emergency'>('personal');

  const todayStr = today();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return passengers;
    return passengers.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
      (p.passportNumber  ?? '').toLowerCase().includes(q) ||
      (p.nationality     ?? '').toLowerCase().includes(q) ||
      (p.visaCountry     ?? '').toLowerCase().includes(q) ||
      (p.frequentFlyerNumber ?? '').toLowerCase().includes(q)
    );
  }, [passengers, search]);

  // Passport and visa expiry alerts
  const alerts = useMemo(() => {
    return passengers.filter(p => {
      if (p.passportExpiry) {
        const d = daysUntil(p.passportExpiry);
        if (d !== null && d >= 0 && d <= 90) return true;
      }
      if (p.visaExpiry) {
        const d = daysUntil(p.visaExpiry);
        if (d !== null && d >= 0 && d <= 30) return true;
      }
      return false;
    });
  }, [passengers]);

  function openNew() {
    setForm({ ...EMPTY_FORM });
    setEditId(null);
    setActiveTab('personal');
    setDrawerOpen(true);
  }

  function openEdit(p: Passenger) {
    setForm(passengerToForm(p));
    setEditId(p.id);
    setActiveTab('personal');
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditId(null);
  }

  function setField<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function handleSave() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error('Required', 'First and last name are required');
      return;
    }
    const data: Partial<Passenger> = {
      ...form,
      displayName: form.displayName?.trim() || `${form.firstName} ${form.lastName}`,
    };
    // Clear empty strings → undefined
    Object.entries(data).forEach(([k, v]) => {
      if (v === '') (data as Record<string, unknown>)[k] = undefined;
    });
    if (editId) {
      updatePassenger(editId, data);
      toast.success('Passenger updated');
    } else {
      createPassenger(data);
      toast.success('Passenger created');
    }
    closeDrawer();
  }

  async function handleDelete(p: Passenger) {
    const ok = await confirm({
      title: `Delete ${p.firstName} ${p.lastName}?`,
      description: 'This will permanently remove this passenger profile.',
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (ok) {
      deletePassenger(p.id);
      toast.success('Passenger deleted');
    }
  }

  function getCustomerName(customerId?: string) {
    if (!customerId) return null;
    return customers.find(c => c.id === customerId)?.name ?? null;
  }

  function passportAlertLevel(expiry?: string): null | 'warn' | 'danger' {
    if (!expiry) return null;
    const d = daysUntil(expiry);
    if (d === null || d < 0) return null;
    if (d <= 30) return 'danger';
    if (d <= 90) return 'warn';
    return null;
  }

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-display">Passenger Master</h1>
          <p className="text-sm text-gray-500 mt-0.5">{passengers.length} passengers · {alerts.length} expiry alert{alerts.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> Add Passenger
        </Button>
      </div>

      {/* Expiry Alerts */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900">Document Expiry Alerts</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {alerts.map(p => {
              const ppDays = p.passportExpiry ? daysUntil(p.passportExpiry) : null;
              const visaDays = p.visaExpiry ? daysUntil(p.visaExpiry) : null;
              return (
                <div key={p.id} className="bg-white rounded-lg border border-amber-200 p-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{p.firstName} {p.lastName}</p>
                    {ppDays !== null && ppDays >= 0 && ppDays <= 90 && (
                      <p className={cn('text-[11px] mt-0.5', ppDays <= 30 ? 'text-red-600 font-bold' : 'text-amber-700')}>
                        Passport: {ppDays === 0 ? 'Expires TODAY' : `${ppDays}d left`} ({fmtDate(p.passportExpiry)})
                      </p>
                    )}
                    {visaDays !== null && visaDays >= 0 && visaDays <= 30 && (
                      <p className={cn('text-[11px] mt-0.5', visaDays <= 7 ? 'text-red-600 font-bold' : 'text-amber-700')}>
                        Visa ({p.visaCountry}): {visaDays === 0 ? 'Expires TODAY' : `${visaDays}d left`}
                      </p>
                    )}
                  </div>
                  <button onClick={() => openEdit(p)} className="text-indigo-500 hover:text-indigo-700 flex-shrink-0">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, passport, nationality..."
          className="w-full pl-9 h-10 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Passenger List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 text-center py-16">
          <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">No passengers yet</p>
          <p className="text-gray-400 text-xs mt-1">Add passenger profiles to track passport and visa information</p>
          <Button onClick={openNew} variant="outline" size="sm" className="mt-4 gap-2">
            <Plus className="w-3.5 h-3.5" /> Add First Passenger
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Passenger', 'Nationality', 'Passport', 'Passport Expiry', 'Visa Status', 'Frequent Flyer', ''].map(h => (
                  <th key={h} className="text-left font-semibold text-gray-500 px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(p => {
                const ppAlert = passportAlertLevel(p.passportExpiry);
                const visaCfg = VISA_STATUS_CONFIG[p.visaStatus ?? 'none'] ?? VISA_STATUS_CONFIG['none'];
                const custName = getCustomerName(p.customerId);
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => openEdit(p)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {p.firstName[0]?.toUpperCase()}{p.lastName[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{p.firstName} {p.lastName}</p>
                          <div className="flex items-center gap-2 text-gray-400">
                            <span className="font-mono">{p.id}</span>
                            {custName && <span>· {custName}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.nationality || '—'}</td>
                    <td className="px-4 py-3 font-mono text-gray-700">
                      {p.passportNumber || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {p.passportExpiry ? (
                        <span className={cn(
                          'font-medium',
                          ppAlert === 'danger' ? 'text-red-600' :
                          ppAlert === 'warn'   ? 'text-amber-600' :
                          'text-gray-600',
                        )}>
                          {fmtDate(p.passportExpiry)}
                          {ppAlert && <span className="ml-1">{ppAlert === 'danger' ? '⚠' : '!'}</span>}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('px-1.5 py-0.5 rounded-full font-medium text-[10px]', visaCfg.class)}>
                        {visaCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{p.frequentFlyerNumber || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(p)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(p)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Passenger Form Drawer ─────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={closeDrawer} />
          <div className="w-full max-w-xl bg-white flex flex-col overflow-hidden shadow-2xl">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {editId ? 'Edit Passenger' : 'New Passenger'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {editId || 'PAX-AUTO'}
                </p>
              </div>
              <button onClick={closeDrawer} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-4 overflow-x-auto">
              {(['personal', 'passport', 'visa', 'travel', 'emergency'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'px-3 py-3 text-xs font-semibold capitalize whitespace-nowrap border-b-2 transition-colors',
                    activeTab === tab
                      ? 'border-indigo-500 text-indigo-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700',
                  )}
                >
                  {tab === 'personal' ? 'Personal' :
                   tab === 'passport' ? 'Passport' :
                   tab === 'visa'     ? 'Visa' :
                   tab === 'travel'   ? 'Travel Prefs' :
                   'Emergency'}
                </button>
              ))}
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {activeTab === 'personal' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <LabeledInput label="First Name" value={form.firstName} onChange={v => setField('firstName', v)} required placeholder="e.g. Rahul" />
                    <LabeledInput label="Last Name"  value={form.lastName}  onChange={v => setField('lastName', v)}  required placeholder="e.g. Sharma" />
                  </div>
                  <LabeledInput label="Display Name (as on passport)" value={form.displayName ?? ''} onChange={v => setField('displayName', v)} placeholder="e.g. SHARMA RAHUL KUMAR" />
                  <div className="grid grid-cols-2 gap-4">
                    <LabeledInput label="Date of Birth" value={form.dateOfBirth ?? ''} onChange={v => setField('dateOfBirth', v)} type="date" />
                    <LabeledSelect label="Gender" value={form.gender ?? ''} onChange={v => setField('gender', v)} options={['', ...GENDER_OPTIONS]} />
                  </div>
                  <LabeledInput label="Nationality" value={form.nationality ?? ''} onChange={v => setField('nationality', v)} placeholder="e.g. Indian" />
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Linked Customer</label>
                    <select
                      value={form.customerId ?? ''}
                      onChange={e => setField('customerId', e.target.value || undefined)}
                      className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Not linked to a customer —</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'passport' && (
                <>
                  <LabeledInput label="Passport Number" value={form.passportNumber ?? ''} onChange={v => setField('passportNumber', v)} placeholder="e.g. A1234567" />
                  <div className="grid grid-cols-2 gap-4">
                    <LabeledInput label="Issue Date"  value={form.passportIssueDate ?? ''} onChange={v => setField('passportIssueDate', v)} type="date" />
                    <LabeledInput label="Expiry Date" value={form.passportExpiry ?? ''}    onChange={v => setField('passportExpiry', v)}    type="date" />
                  </div>
                  <LabeledInput label="Place of Issue" value={form.placeOfIssue ?? ''} onChange={v => setField('placeOfIssue', v)} placeholder="e.g. New Delhi" />
                  {form.passportExpiry && (() => {
                    const d = daysUntil(form.passportExpiry);
                    if (d !== null && d >= 0 && d <= 90) return (
                      <div className={cn('rounded-lg p-3 text-xs font-medium', d <= 30 ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200')}>
                        ⚠ Passport expires in {d} days ({fmtDate(form.passportExpiry)})
                      </div>
                    );
                    return null;
                  })()}
                </>
              )}

              {activeTab === 'visa' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Visa Status</label>
                    <select
                      value={form.visaStatus ?? 'none'}
                      onChange={e => setField('visaStatus', e.target.value)}
                      className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Object.entries(VISA_STATUS_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <LabeledInput label="Visa Country" value={form.visaCountry ?? ''} onChange={v => setField('visaCountry', v)} placeholder="e.g. UAE" />
                    <LabeledInput label="Visa Type"    value={form.visaType    ?? ''} onChange={v => setField('visaType', v)}    placeholder="e.g. Tourist" />
                  </div>
                  <LabeledInput label="Visa Expiry Date" value={form.visaExpiry ?? ''} onChange={v => setField('visaExpiry', v)} type="date" />
                  {form.visaExpiry && (() => {
                    const d = daysUntil(form.visaExpiry);
                    if (d !== null && d >= 0 && d <= 30) return (
                      <div className={cn('rounded-lg p-3 text-xs font-medium', d <= 7 ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200')}>
                        ⚠ Visa expires in {d} days ({fmtDate(form.visaExpiry)})
                      </div>
                    );
                    return null;
                  })()}
                </>
              )}

              {activeTab === 'travel' && (
                <>
                  <LabeledInput label="Frequent Flyer Number" value={form.frequentFlyerNumber ?? ''} onChange={v => setField('frequentFlyerNumber', v)} placeholder="e.g. 6E-9876543210" />
                  <LabeledSelect label="Meal Preference" value={form.mealPreference ?? 'No Preference'} onChange={v => setField('mealPreference', v)} options={MEAL_OPTIONS} />
                  <LabeledSelect label="Seat Preference" value={form.seatPreference ?? 'No Preference'} onChange={v => setField('seatPreference', v)} options={SEAT_OPTIONS} />
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Notes</label>
                    <textarea
                      value={form.notes ?? ''}
                      onChange={e => setField('notes', e.target.value)}
                      rows={3}
                      placeholder="Any special requirements or notes..."
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </>
              )}

              {activeTab === 'emergency' && (
                <>
                  <LabeledInput label="Emergency Contact Name"  value={form.emergencyContactName  ?? ''} onChange={v => setField('emergencyContactName', v)}  placeholder="e.g. Priya Sharma" />
                  <LabeledInput label="Emergency Contact Phone" value={form.emergencyContactPhone ?? ''} onChange={v => setField('emergencyContactPhone', v)} placeholder="e.g. 9876543210" type="tel" />
                  <LabeledInput label="Relationship"           value={form.emergencyRelation     ?? ''} onChange={v => setField('emergencyRelation', v)}     placeholder="e.g. Spouse, Parent" />
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button onClick={closeDrawer} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Cancel
              </button>
              <Button onClick={handleSave} className="gap-2">
                {editId ? 'Save Changes' : 'Create Passenger'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
