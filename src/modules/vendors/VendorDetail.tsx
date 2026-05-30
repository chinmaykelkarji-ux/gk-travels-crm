import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Trash2, Plus, Phone, Mail, MapPin,
  Building2, CreditCard, CheckCircle, AlertCircle, IndianRupee,
} from 'lucide-react';
import { useStore, selectors } from '@/store';
import apiClient from '@/lib/apiClient';
import { formatCurrency } from '@/shared/utils/format';
import { fmtDate } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import type { VendorPayment } from '@/shared/types';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { VendorForm } from './VendorForm';
import { VendorPaymentForm } from './VendorPaymentForm';
import { VENDOR_TYPES } from './VendorForm';

export default function VendorDetail() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const vendor         = useStore(selectors.vendorById(id ?? ''));
  const vendorPayments = useStore(selectors.vendorPaymentsForVendor(id ?? ''));
  const updateVendor   = useStore(s => s.updateVendor);
  const deleteVendor   = useStore(s => s.deleteVendor);
  const createVendorPayment = useStore(s => s.createVendorPayment);
  const updateVendorPayment = useStore(s => s.updateVendorPayment);
  const deleteVendorPayment = useStore(s => s.deleteVendorPayment);
  const markVendorPaid      = useStore(s => s.markVendorPaid);

  const [editOpen,    setEditOpen]    = useState(false);
  const [payOpen,     setPayOpen]     = useState(false);
  const [editPayment, setEditPayment] = useState<VendorPayment | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  if (!vendor) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Vendor not found.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/vendors')} className="mt-3">← Back to Vendors</Button>
      </div>
    );
  }

  const typeInfo = VENDOR_TYPES.find(t => t.value === vendor!.type);

  // Financial summary
  const totalCost  = vendorPayments.reduce((s, p) => s + p.totalCost,   0);
  const totalPaid  = vendorPayments.reduce((s, p) => s + p.advancePaid, 0);
  const totalOwed  = vendorPayments.filter(p => !p.isPaid).reduce((s, p) => s + p.outstanding, 0);

  async function handleDeleteVendor() {
    const ok = await confirm({
      title:        `Delete "${vendor!.name}"?`,
      description:  'All payment records for this vendor will also be deleted.',
      confirmLabel: 'Delete Vendor',
      variant:      'destructive',
    });
    if (!ok) return;
    try {
      await apiClient.delete(`/vendors/${id}`);
      deleteVendor(id!);
      toast.success('Vendor deleted');
      navigate('/vendors');
    } catch {
      toast.error('Failed to delete vendor');
    }
  }

  async function handleDeletePayment(p: VendorPayment) {
    const ok = await confirm({
      title:        'Delete payment record?',
      description:  `Remove ₹${p.totalCost} record for "${p.description || 'this payment'}"?`,
      confirmLabel: 'Delete',
      variant:      'destructive',
    });
    if (!ok) return;
    setDeletingId(p.id);
    try {
      await apiClient.delete(`/vendors/payments/${p.id}`);
      deleteVendorPayment(p.id);
      toast.success('Payment record deleted');
    } catch {
      toast.error('Failed to delete payment');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Back + Actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button onClick={() => navigate('/vendors')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Vendors
        </button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDeleteVendor} className="gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Hero Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100"
          style={{ background: 'linear-gradient(135deg,#F8FAFF 0%,#FAFAFA 100%)' }}>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 bg-white shadow-sm border border-gray-100">
              {typeInfo?.emoji ?? '📦'}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900 font-display">{vendor.name}</h1>
                <Badge variant={vendor.isActive ? 'success' : 'destructive'}>
                  {vendor.isActive ? 'Active' : 'Inactive'}
                </Badge>
                <Badge variant="secondary">{typeInfo?.label ?? vendor.type}</Badge>
              </div>
              {vendor.companyName && (
                <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />{vendor.companyName}
                </p>
              )}
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                {vendor.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400" />{vendor.phone}</span>}
                {vendor.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-gray-400" />{vendor.email}</span>}
                {vendor.destinations.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />{vendor.destinations.join(', ')}
                  </span>
                )}
              </div>
            </div>

            {/* Financial pill */}
            <div className="flex-shrink-0 text-right space-y-1">
              {totalOwed > 0
                ? <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-center">
                    <div className="text-xs text-amber-600 font-medium">Outstanding</div>
                    <div className="text-lg font-bold text-amber-700 font-display">{formatCurrency(totalOwed)}</div>
                  </div>
                : totalCost > 0
                  ? <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-center">
                      <div className="text-xs text-emerald-600 font-medium">Fully Settled</div>
                      <div className="text-lg font-bold text-emerald-700 font-display">{formatCurrency(totalCost)}</div>
                    </div>
                  : null
              }
            </div>
          </div>
        </div>

        {/* Details row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100">
          {[
            { label: 'Contact',       value: vendor.contactPerson || '—' },
            { label: 'WhatsApp',      value: vendor.whatsapp || vendor.phone },
            { label: 'GST',           value: vendor.gstNumber || '—' },
            { label: 'Payment Terms', value: vendor.paymentTerms || '—' },
          ].map(item => (
            <div key={item.label} className="px-5 py-3">
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{item.label}</p>
              <p className="text-sm text-gray-700 mt-0.5 truncate">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Bank details */}
        {(vendor.bankDetails.bankName || vendor.bankDetails.accountNo) && (
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-semibold text-gray-700">Bank Details</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-gray-600">
              {vendor.bankDetails.accountHolder && <span><strong>Name:</strong> {vendor.bankDetails.accountHolder}</span>}
              {vendor.bankDetails.bankName      && <span><strong>Bank:</strong> {vendor.bankDetails.bankName}</span>}
              {vendor.bankDetails.accountNo     && <span><strong>Account:</strong> {vendor.bankDetails.accountNo}</span>}
              {vendor.bankDetails.ifsc          && <span><strong>IFSC:</strong> {vendor.bankDetails.ifsc}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Finance Summary */}
      {vendorPayments.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Cost',    value: totalCost, color: 'text-gray-900' },
            { label: 'Total Paid',    value: totalPaid, color: 'text-emerald-600' },
            { label: 'Outstanding',   value: totalOwed, color: totalOwed > 0 ? 'text-amber-600' : 'text-emerald-600' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
              <div className={cn('text-2xl font-bold font-display', item.color)}>{formatCurrency(item.value)}</div>
              <div className="text-xs text-gray-500 mt-1">{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Payment Records */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-semibold text-gray-800">Payment Records</span>
            {vendorPayments.length > 0 && <Badge variant="secondary">{vendorPayments.length}</Badge>}
          </div>
          <Button size="sm" variant="outline" className="gap-1.5"
            onClick={() => { setEditPayment(null); setPayOpen(true); }}>
            <Plus className="w-3.5 h-3.5" /> Record Cost
          </Button>
        </div>

        {vendorPayments.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <IndianRupee className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No payment records yet</p>
            <p className="text-xs mt-1">Click "Record Cost" to log a vendor engagement</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Trip', 'Description', 'Total Cost', 'Advance Paid', 'Outstanding', 'Due Date', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vendorPayments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-indigo-600 font-mono whitespace-nowrap">
                      {p.tripId
                        ? <button onClick={() => navigate(`/trips/${p.tripId}`)}
                            className="hover:underline">{p.tripId}</button>
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate">{p.description || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{formatCurrency(p.totalCost)}</td>
                    <td className="px-4 py-3 text-emerald-600 font-medium">{formatCurrency(p.advancePaid)}</td>
                    <td className={cn('px-4 py-3 font-semibold', p.isPaid ? 'text-emerald-600' : p.outstanding > 0 ? 'text-amber-600' : 'text-gray-400')}>
                      {p.isPaid ? '—' : formatCurrency(p.outstanding)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {p.dueDate ? fmtDate(p.dueDate) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {p.isPaid
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                            <CheckCircle className="w-3.5 h-3.5" /> Paid
                          </span>
                        : <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                            <AlertCircle className="w-3.5 h-3.5" /> Pending
                          </span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {!p.isPaid && (
                          <Button size="icon-sm" variant="ghost" title="Mark Paid"
                            onClick={() => markVendorPaid(p.id)}>
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                          </Button>
                        )}
                        <Button size="icon-sm" variant="ghost" title="Edit"
                          onClick={() => { setEditPayment(p); setPayOpen(true); }}>
                          <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                        </Button>
                        <Button size="icon-sm" variant="ghost" title="Delete"
                          disabled={deletingId === p.id}
                          onClick={() => handleDeletePayment(p)}
                          className="hover:bg-red-50 hover:text-red-600">
                          {deletingId === p.id
                            ? <span className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin block" />
                            : <Trash2 className="w-3.5 h-3.5" />
                          }
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notes */}
      {vendor.notes && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-2">NOTES</p>
          <p className="text-sm text-gray-700 leading-relaxed">{vendor.notes}</p>
        </div>
      )}

      {/* Edit Vendor */}
      <VendorForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        defaultValues={vendor}
        onSubmit={data => { updateVendor(id!, data); toast.success('Vendor updated'); setEditOpen(false); }}
      />

      {/* Add / Edit Payment */}
      <VendorPaymentForm
        open={payOpen}
        onClose={() => { setPayOpen(false); setEditPayment(null); }}
        vendorId={vendor.id}
        vendorName={vendor.name}
        defaultValues={editPayment}
        onSubmit={data => {
          if (editPayment) {
            updateVendorPayment(editPayment.id, data);
            toast.success('Payment updated');
          } else {
            createVendorPayment(data);
            toast.success('Cost recorded');
          }
          setPayOpen(false);
          setEditPayment(null);
        }}
      />
    </div>
  );
}
