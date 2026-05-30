import { useEffect, useState } from 'react';
import type { Vendor, VendorType, VendorBankDetails } from '@/shared/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogBody,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { cn } from '@/shared/utils/cn';

export const VENDOR_TYPES: { value: VendorType; label: string; emoji: string }[] = [
  { value: 'hotel',         label: 'Hotel',         emoji: '🏨' },
  { value: 'transport',     label: 'Transport',      emoji: '🚌' },
  { value: 'activity',      label: 'Activity',       emoji: '🎯' },
  { value: 'guide',         label: 'Guide',          emoji: '🧭' },
  { value: 'visa',          label: 'Visa',           emoji: '📋' },
  { value: 'miscellaneous', label: 'Miscellaneous',  emoji: '📦' },
];

interface VendorFormProps {
  open:          boolean;
  onClose:       () => void;
  onSubmit:      (data: Partial<Vendor>) => void;
  defaultValues?: Partial<Vendor> | null;
  loading?:      boolean;
}

export function VendorForm({ open, onClose, onSubmit, defaultValues, loading }: VendorFormProps) {
  const [name,          setName]          = useState('');
  const [companyName,   setCompanyName]   = useState('');
  const [type,          setType]          = useState<VendorType>('hotel');
  const [contactPerson, setContactPerson] = useState('');
  const [phone,         setPhone]         = useState('');
  const [whatsapp,      setWhatsapp]      = useState('');
  const [email,         setEmail]         = useState('');
  const [destinationsRaw, setDestinationsRaw] = useState(''); // comma-separated
  const [paymentTerms,  setPaymentTerms]  = useState('');
  const [gstNumber,     setGstNumber]     = useState('');
  const [notes,         setNotes]         = useState('');
  const [isActive,      setIsActive]      = useState(true);
  // Bank details
  const [accountHolder, setAccountHolder] = useState('');
  const [bankName,      setBankName]      = useState('');
  const [accountNo,     setAccountNo]     = useState('');
  const [ifsc,          setIfsc]          = useState('');
  const [error,         setError]         = useState('');

  useEffect(() => {
    if (!open) return;
    const d = defaultValues;
    setName(d?.name          ?? '');
    setCompanyName(d?.companyName ?? '');
    setType(d?.type          ?? 'hotel');
    setContactPerson(d?.contactPerson ?? '');
    setPhone(d?.phone        ?? '');
    setWhatsapp(d?.whatsapp  ?? '');
    setEmail(d?.email        ?? '');
    setDestinationsRaw((d?.destinations ?? []).join(', '));
    setPaymentTerms(d?.paymentTerms ?? '');
    setGstNumber(d?.gstNumber   ?? '');
    setNotes(d?.notes           ?? '');
    setIsActive(d?.isActive     ?? true);
    const bd = d?.bankDetails ?? {};
    setAccountHolder(bd.accountHolder ?? '');
    setBankName(bd.bankName          ?? '');
    setAccountNo(bd.accountNo        ?? '');
    setIfsc(bd.ifsc                  ?? '');
    setError('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit() {
    if (!name.trim())  { setError('Vendor name is required'); return; }
    if (!phone.trim()) { setError('Phone number is required'); return; }

    const destinations = destinationsRaw
      .split(',')
      .map(d => d.trim())
      .filter(Boolean);

    const bankDetails: VendorBankDetails = {};
    if (accountHolder) bankDetails.accountHolder = accountHolder;
    if (bankName)      bankDetails.bankName      = bankName;
    if (accountNo)     bankDetails.accountNo     = accountNo;
    if (ifsc)          bankDetails.ifsc          = ifsc;

    onSubmit({
      name, companyName: companyName || undefined,
      type, contactPerson: contactPerson || undefined,
      phone, whatsapp: whatsapp || undefined,
      email: email || undefined,
      destinations, paymentTerms: paymentTerms || undefined,
      bankDetails, gstNumber: gstNumber || undefined,
      notes: notes || undefined, isActive,
    });
  }

  const isEdit = !!defaultValues?.id;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Vendor' : 'New Vendor'}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          {/* Vendor Type */}
          <div className="space-y-2">
            <Label required>Vendor Type</Label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {VENDOR_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-xs font-medium transition-all',
                    type === t.value
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  )}
                >
                  <span className="text-lg">{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name + Company */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vf-name" required>Vendor / Trade Name</Label>
              <Input id="vf-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Atlantis Transfers" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vf-company">Company Name</Label>
              <Input id="vf-company" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Legal entity name" />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vf-contact">Contact Person</Label>
              <Input id="vf-contact" value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vf-phone" required>Phone</Label>
              <Input id="vf-phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vf-wa">WhatsApp</Label>
              <Input id="vf-wa" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="Same as phone if same" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vf-email">Email</Label>
              <Input id="vf-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vendor@email.com" />
            </div>
          </div>

          {/* Destinations + GST */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vf-dest">Destinations Served</Label>
              <Input id="vf-dest" value={destinationsRaw} onChange={e => setDestinationsRaw(e.target.value)} placeholder="Dubai, Bali, Maldives (comma separated)" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vf-gst">GST Number</Label>
              <Input id="vf-gst" value={gstNumber} onChange={e => setGstNumber(e.target.value)} placeholder="22AAAAA0000A1Z5" />
            </div>
          </div>

          {/* Payment Terms */}
          <div className="space-y-1.5">
            <Label htmlFor="vf-terms">Payment Terms</Label>
            <Input id="vf-terms" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="e.g. 50% advance, balance before service" />
          </div>

          {/* Bank Details */}
          <div className="space-y-2">
            <Label>Bank Details</Label>
            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="space-y-1.5">
                <Label htmlFor="vf-holder">Account Holder</Label>
                <Input id="vf-holder" value={accountHolder} onChange={e => setAccountHolder(e.target.value)} placeholder="Name as per bank" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vf-bank">Bank Name</Label>
                <Input id="vf-bank" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="HDFC Bank" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vf-acc">Account Number</Label>
                <Input id="vf-acc" value={accountNo} onChange={e => setAccountNo(e.target.value)} placeholder="00000000000" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vf-ifsc">IFSC Code</Label>
                <Input id="vf-ifsc" value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} placeholder="HDFC0001234" />
              </div>
            </div>
          </div>

          {/* Notes + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vf-notes">Notes</Label>
              <Input id="vf-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Special terms, contacts, etc." />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="flex gap-2 mt-1">
                {[true, false].map(val => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setIsActive(val)}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-xs font-semibold border transition-all',
                      isActive === val
                        ? val ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-500 text-white border-red-500'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    )}
                  >
                    {val ? 'Active' : 'Inactive'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={handleSubmit}>
            {isEdit ? 'Save Changes' : 'Create Vendor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
