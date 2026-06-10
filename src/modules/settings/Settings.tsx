import { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import {
  Settings as SettingsIcon, Database, Trash2,
  Users, Plus, Edit2, KeyRound, Shield, CheckCircle, XCircle,
  Building2, Save,
} from 'lucide-react';
import { useStore } from '@/store';
import { useAuth, usePermission } from '@/backend/auth/AuthContext';
import { PERMISSIONS } from '@/backend/auth/permissions';
import apiClient from '@/lib/apiClient';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogBody,
} from '@/shared/components/ui/dialog';
import { confirm } from '@/shared/hooks/useConfirm';
import { toast } from '@/shared/hooks/useToast';
import { cn } from '@/shared/utils/cn';
import { getApiErrorMessage } from '@/shared/utils/error';
import type { CompanySettings } from '@/shared/types';

// ─── Types ───────────────────────────────────────────────────

interface CrmUser {
  id:        string;
  email:     string;
  name:      string;
  role:      string;
  isActive:  boolean;
  createdAt: string;
}

const ROLES = ['ADMIN', 'MANAGER', 'STAFF'] as const;
type Role = typeof ROLES[number];

const ROLE_BADGE: Record<string, 'default' | 'warning' | 'secondary'> = {
  ADMIN:   'default',
  MANAGER: 'warning',
  STAFF:   'secondary',
};

// ─── User form dialog ────────────────────────────────────────

interface UserFormProps {
  open:     boolean;
  onClose:  () => void;
  onSaved:  (user: CrmUser) => void;
  editing?: CrmUser | null;
}

function UserFormDialog({ open, onClose, onSaved, editing }: UserFormProps) {
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [role,     setRole]     = useState<Role>('STAFF');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (!open) return;
    setName(editing?.name  ?? '');
    setEmail(editing?.email ?? '');
    setRole((editing?.role as Role) ?? 'STAFF');
    setPassword('');
    setError('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!name.trim())  { setError('Name is required'); return; }
    if (!email.trim()) { setError('Email is required'); return; }
    if (!editing && password.length < 6) { setError('Password must be at least 6 characters'); return; }

    setSaving(true);
    setError('');
    try {
      let user: CrmUser;
      if (editing) {
        const res = await apiClient.put(`/users/${editing.id}`, { name, email, role });
        user = res.data as CrmUser;
        // Change password if provided
        if (password.length >= 6) {
          await apiClient.put(`/users/${editing.id}/password`, { newPassword: password });
        }
      } else {
        const res = await apiClient.post('/users', { name, email, password, role });
        user = res.data as CrmUser;
      }
      onSaved(user);
      onClose();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to save user'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit User' : 'Create User'}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="u-name" required>Full Name</Label>
            <Input id="u-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya Singh" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-email" required>Email</Label>
            <Input id="u-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@gktravels.local" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-password">
              {editing ? 'New Password' : 'Password'}
              {editing && <span className="ml-1 text-[10px] text-gray-400 font-normal">(leave blank to keep current)</span>}
            </Label>
            <Input
              id="u-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={editing ? 'Leave blank to keep current' : 'Min. 6 characters'}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="flex gap-2">
              {ROLES.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-xs font-semibold border transition-all',
                    role === r
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={handleSave}>
            {editing ? 'Save Changes' : 'Create User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reset password dialog ────────────────────────────────────

interface ResetPasswordProps { open: boolean; onClose: () => void; userId: string; userName: string; }

function ResetPasswordDialog({ open, onClose, userId, userName }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => { if (open) setPassword(''); }, [open]);

  async function handleReset() {
    if (password.length < 6) { toast.error('Too short', 'Password must be at least 6 characters'); return; }
    setSaving(true);
    try {
      await apiClient.put(`/users/${userId}/password`, { newPassword: password });
      toast.success('Password reset', `Password for ${userName} has been updated.`);
      onClose();
    } catch (err: unknown) {
      toast.error('Reset failed', getApiErrorMessage(err, 'Failed to reset password'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Reset Password — {userName}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-1.5">
            <Label htmlFor="rp-pw" required>New Password</Label>
            <Input
              id="rp-pw"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              autoFocus
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={handleReset}>Reset Password</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Users tab ───────────────────────────────────────────────

function UsersTab() {
  const { user: currentUser } = useAuth();
  const [users,     setUsers]     = useState<CrmUser[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [formOpen,  setFormOpen]  = useState(false);
  const [editUser,  setEditUser]  = useState<CrmUser | null>(null);
  const [resetUser, setResetUser] = useState<CrmUser | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/users');
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  function handleSaved(user: CrmUser) {
    setUsers(prev => {
      const idx = prev.findIndex(u => u.id === user.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = user;
        return next;
      }
      return [...prev, user];
    });
    toast.success(editUser ? 'User updated' : 'User created', user.email);
  }

  async function handleToggleActive(u: CrmUser) {
    const action = u.isActive ? 'deactivate' : 'reactivate';
    const ok = await confirm({
      title:        `${u.isActive ? 'Deactivate' : 'Reactivate'} ${u.name}?`,
      description:  u.isActive
        ? 'This user will no longer be able to log in.'
        : 'This user will be able to log in again.',
      confirmLabel: u.isActive ? 'Deactivate' : 'Reactivate',
      variant:      u.isActive ? 'destructive' : 'default',
    });
    if (!ok) return;
    try {
      const res = await apiClient.put(`/users/${u.id}`, { isActive: !u.isActive });
      setUsers(prev => prev.map(x => x.id === u.id ? res.data as CrmUser : x));
      toast.success(`User ${u.isActive ? 'deactivated' : 'reactivated'}`);
    } catch {
      toast.error('Failed to update user');
    }
  }

  async function handleDelete(u: CrmUser) {
    const ok = await confirm({
      title:        `Delete ${u.name}?`,
      description:  'This will permanently remove this user. This cannot be undone.',
      confirmLabel: 'Delete User',
      variant:      'destructive',
    });
    if (!ok) return;
    setDeletingId(u.id);
    try {
      await apiClient.delete(`/users/${u.id}`);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      toast.success('User deleted');
    } catch (err: unknown) {
      toast.error('Delete failed', getApiErrorMessage(err, 'Failed to delete user'));
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{users.length} user{users.length !== 1 ? 's' : ''} in the system</p>
        <Button size="sm" className="gap-1.5" onClick={() => { setEditUser(null); setFormOpen(true); }}>
          <Plus className="w-3.5 h-3.5" /> Create User
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Name', 'Email', 'Role', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 text-sm">{u.name}</div>
                      {u.id === currentUser?.id && (
                        <div className="text-[10px] text-indigo-600 font-medium">You</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{u.email}</td>
                <td className="px-4 py-3">
                  <Badge variant={ROLE_BADGE[u.role] ?? 'secondary'}>{u.role}</Badge>
                </td>
                <td className="px-4 py-3">
                  {u.isActive
                    ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle className="w-3.5 h-3.5" /> Active</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-red-500"><XCircle className="w-3.5 h-3.5" /> Inactive</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon-sm" variant="ghost"
                      title="Edit user"
                      onClick={() => { setEditUser(u); setFormOpen(true); }}
                    >
                      <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                    </Button>
                    <Button
                      size="icon-sm" variant="ghost"
                      title="Reset password"
                      onClick={() => setResetUser(u)}
                    >
                      <KeyRound className="w-3.5 h-3.5 text-gray-400" />
                    </Button>
                    {u.id !== currentUser?.id && (
                      <>
                        <Button
                          size="icon-sm" variant="ghost"
                          title={u.isActive ? 'Deactivate' : 'Reactivate'}
                          onClick={() => handleToggleActive(u)}
                        >
                          <Shield className={cn('w-3.5 h-3.5', u.isActive ? 'text-amber-500' : 'text-emerald-500')} />
                        </Button>
                        <Button
                          size="icon-sm" variant="ghost"
                          title="Delete user"
                          disabled={deletingId === u.id}
                          onClick={() => handleDelete(u)}
                          className="hover:bg-red-50 hover:text-red-600"
                        >
                          {deletingId === u.id
                            ? <span className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin block" />
                            : <Trash2 className="w-3.5 h-3.5" />
                          }
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UserFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditUser(null); }}
        onSaved={handleSaved}
        editing={editUser}
      />
      {resetUser && (
        <ResetPasswordDialog
          open={!!resetUser}
          onClose={() => setResetUser(null)}
          userId={resetUser.id}
          userName={resetUser.name}
        />
      )}
    </div>
  );
}

// ─── Company Master tab ────────────────────────────────────────

type CompanyForm = Omit<CompanySettings, 'id'>;

const EMPTY_COMPANY_FORM: CompanyForm = {
  companyName:         '',
  legalName:           '',
  gstin:               '',
  pan:                 '',
  addressLine1:        '',
  addressLine2:        '',
  city:                '',
  state:               '',
  stateCode:           '',
  pincode:             '',
  phone:               '',
  email:               '',
  website:             '',
  logoUrl:             '',
  bankName:            '',
  bankAccountName:     '',
  bankAccountNumber:   '',
  bankIfsc:            '',
  bankBranch:          '',
  invoicePrefix:       'GK',
  invoiceTerms:        '',
  authorizedSignatory: '',
  signatureUrl:        '',
  gstFrozenUntil:      null,
};

function toFormValue(v: string | null | undefined): string {
  return v ?? '';
}

function CompanyMasterTab() {
  const companySettings       = useStore(s => s.companySettings);
  const updateCompanySettings = useStore(s => s.updateCompanySettings);
  const [form,   setForm]   = useState<CompanyForm>(EMPTY_COMPANY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companySettings) return;
    const { id: _id, ...rest } = companySettings;
    setForm({
      ...EMPTY_COMPANY_FORM,
      ...rest,
      gstFrozenUntil: rest.gstFrozenUntil ?? null,
    });
  }, [companySettings]);

  function field<K extends keyof CompanyForm>(key: K) {
    return {
      value: toFormValue(form[key] as string | null | undefined),
      onChange: (e: ChangeEvent<HTMLInputElement>) =>
        setForm(prev => ({ ...prev, [key]: e.target.value })),
    };
  }

  async function handleSave() {
    if (!form.companyName.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      const res = await updateCompanySettings({
        ...form,
        legalName:           form.legalName || null,
        gstin:               form.gstin || null,
        pan:                 form.pan || null,
        addressLine1:        form.addressLine1 || null,
        addressLine2:        form.addressLine2 || null,
        city:                form.city || null,
        state:               form.state || null,
        stateCode:           form.stateCode || null,
        pincode:             form.pincode || null,
        phone:               form.phone || null,
        email:               form.email || null,
        website:             form.website || null,
        logoUrl:             form.logoUrl || null,
        bankName:            form.bankName || null,
        bankAccountName:     form.bankAccountName || null,
        bankAccountNumber:   form.bankAccountNumber || null,
        bankIfsc:            form.bankIfsc || null,
        bankBranch:          form.bankBranch || null,
        invoicePrefix:       form.invoicePrefix.trim() || 'GK',
        invoiceTerms:        form.invoiceTerms || null,
        authorizedSignatory: form.authorizedSignatory || null,
        signatureUrl:        form.signatureUrl || null,
      });
      if (res.ok) {
        toast.success('Company Master updated', 'These details will appear on invoices, quotations, receipts and vouchers.');
      } else {
        toast.error('Update failed', res.reason ?? 'Could not save company details');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Company identity */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-indigo-600" /> Company Identity
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cs-name" required>Company Name</Label>
            <Input id="cs-name" placeholder="GK Travels" {...field('companyName')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-legal">Legal Name</Label>
            <Input id="cs-legal" placeholder="GK Travels Pvt. Ltd." {...field('legalName')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-gstin">GSTIN</Label>
            <Input id="cs-gstin" placeholder="27ABCDE1234F1Z5" className="uppercase" {...field('gstin')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-pan">PAN</Label>
            <Input id="cs-pan" placeholder="ABCDE1234F" className="uppercase" {...field('pan')} />
          </div>
        </div>
      </div>

      {/* Address */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Registered Address</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cs-addr1">Address Line 1</Label>
            <Input id="cs-addr1" placeholder="Office / Building, Street" {...field('addressLine1')} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cs-addr2">Address Line 2</Label>
            <Input id="cs-addr2" placeholder="Area, Landmark" {...field('addressLine2')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-city">City</Label>
            <Input id="cs-city" placeholder="Mumbai" {...field('city')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-state">State</Label>
            <Input id="cs-state" placeholder="Maharashtra" {...field('state')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-statecode">State Code</Label>
            <Input id="cs-statecode" placeholder="27" {...field('stateCode')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-pincode">PIN Code</Label>
            <Input id="cs-pincode" placeholder="400001" {...field('pincode')} />
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Contact Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cs-phone">Phone</Label>
            <Input id="cs-phone" placeholder="+91 98765 43210" {...field('phone')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-email">Email</Label>
            <Input id="cs-email" type="email" placeholder="info@gktravels.com" {...field('email')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-website">Website</Label>
            <Input id="cs-website" placeholder="www.gktravels.com" {...field('website')} />
          </div>
        </div>
      </div>

      {/* Invoice settings */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Invoice Settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cs-prefix" required>Invoice Number Prefix</Label>
            <Input id="cs-prefix" placeholder="GK" className="uppercase" {...field('invoicePrefix')} />
            <p className="text-[11px] text-gray-400">
              Invoices are numbered as <span className="font-mono">{(form.invoicePrefix || 'GK').toUpperCase()}/2026-27/01</span>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-signatory">Authorized Signatory</Label>
            <Input id="cs-signatory" placeholder="Name / Designation" {...field('authorizedSignatory')} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cs-terms">Default Terms &amp; Conditions</Label>
            <Input id="cs-terms" placeholder="e.g. Payment due within 7 days of invoice date" {...field('invoiceTerms')} />
          </div>
        </div>
      </div>

      {/* Bank details */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Bank Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cs-bankname">Bank Name</Label>
            <Input id="cs-bankname" placeholder="HDFC Bank" {...field('bankName')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-bankaccname">Account Holder Name</Label>
            <Input id="cs-bankaccname" placeholder="GK Travels" {...field('bankAccountName')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-bankaccno">Account Number</Label>
            <Input id="cs-bankaccno" placeholder="000123456789" {...field('bankAccountNumber')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-ifsc">IFSC Code</Label>
            <Input id="cs-ifsc" placeholder="HDFC0001234" className="uppercase" {...field('bankIfsc')} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cs-branch">Branch</Label>
            <Input id="cs-branch" placeholder="Andheri West, Mumbai" {...field('bankBranch')} />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" loading={saving} onClick={handleSave}>
          <Save className="w-3.5 h-3.5" /> Save Company Details
        </Button>
      </div>
    </div>
  );
}

// ─── Main Settings page ───────────────────────────────────────

export default function Settings() {
  const clearAll  = useStore(s => s.clearAll);
  const trips     = useStore(s => s.trips);
  const leads     = useStore(s => s.leads);
  const customers = useStore(s => s.customers);
  const canEditOrg = usePermission(PERMISSIONS.SETTINGS_ORG);

  async function handleClearAll() {
    const ok = await confirm({
      title:        'Reset all local data?',
      description:  'This clears the in-memory store. Data in PostgreSQL is not affected.',
      confirmLabel: 'Reset',
      variant:      'destructive',
    });
    if (ok) { clearAll(); toast.success('Local store cleared'); }
  }

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold text-gray-900 font-display">Settings</h2>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="w-3.5 h-3.5" /> User Management
          </TabsTrigger>
          {canEditOrg && (
            <TabsTrigger value="company" className="gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Company Master
            </TabsTrigger>
          )}
          <TabsTrigger value="data" className="gap-1.5">
            <Database className="w-3.5 h-3.5" /> Data
          </TabsTrigger>
        </TabsList>

        {/* Users tab */}
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>

        {/* Company Master tab */}
        {canEditOrg && (
          <TabsContent value="company">
            <CompanyMasterTab />
          </TabsContent>
        )}

        {/* Data tab */}
        <TabsContent value="data">
          <div className="space-y-4">
            {/* Stats */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-600" /> Data Summary
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Trips',     count: trips.length     },
                  { label: 'Leads',     count: leads.length     },
                  { label: 'Customers', count: customers.length },
                ].map(item => (
                  <div key={item.label} className="text-center p-4 bg-gray-50 rounded-xl">
                    <div className="text-2xl font-bold text-gray-900 font-display">{item.count}</div>
                    <div className="text-xs text-gray-500 mt-1">{item.label}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-4">
                All data is stored in your local PostgreSQL database. The in-memory Zustand store is
                re-loaded from the API on every page refresh.
              </p>
            </div>

            {/* Danger zone */}
            <div className="bg-white rounded-2xl border border-red-200 p-5">
              <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Danger Zone
              </h3>
              <p className="text-xs text-gray-600 mb-4">
                Reset the in-memory store (does not affect PostgreSQL). Use for debugging only.
              </p>
              <Button variant="destructive" size="sm" onClick={handleClearAll} className="gap-2">
                <Trash2 className="w-3.5 h-3.5" /> Clear In-Memory Store
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
