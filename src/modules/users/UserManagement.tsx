import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, ShieldOff, ShieldCheck, UsersRound } from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { useAuth } from '@/backend/auth/AuthContext';
import type { UserRole } from '@/backend/auth/types';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogBody,
} from '@/shared/components/ui/dialog';
import { confirm } from '@/shared/hooks/useConfirm';
import { toast } from '@/shared/hooks/useToast';
import { getApiErrorMessage } from '@/shared/utils/error';
import { cn } from '@/shared/utils/cn';
import { EmptyState } from '@/shared/components/EmptyState';

// ─── Types ───────────────────────────────────────────────────

interface CrmUser {
  id:          string;
  email:       string;
  name:        string;
  role:        UserRole;
  isActive:    boolean;
  lastLoginAt: string | null;
  createdAt:   string;
}

const ROLES: UserRole[] = ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'];

const ROLE_BADGE_CLASS: Record<UserRole, string> = {
  ADMIN:      'bg-red-100 text-red-700 ring-1 ring-red-200/60',
  BOOKING:    'bg-blue-100 text-blue-700 ring-1 ring-blue-200/60',
  ACCOUNTS:   'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/60',
  OPERATIONS: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200/60',
};

function formatLastLogin(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── User form dialog (Add / Edit) ─────────────────────────────

interface UserFormProps {
  open:     boolean;
  onClose:  () => void;
  onSaved:  (user: CrmUser) => void;
  editing?: CrmUser | null;
  selfId:   string | undefined;
}

function UserFormDialog({ open, onClose, onSaved, editing, selfId }: UserFormProps) {
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [role,     setRole]     = useState<UserRole>('BOOKING');
  const [isActive, setIsActive] = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const isSelf = !!editing && editing.id === selfId;

  useEffect(() => {
    if (!open) return;
    setName(editing?.name  ?? '');
    setEmail(editing?.email ?? '');
    setRole(editing?.role ?? 'BOOKING');
    setIsActive(editing?.isActive ?? true);
    setPassword('');
    setError('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!name.trim())  { setError('Name is required'); return; }
    if (!email.trim()) { setError('Email is required'); return; }
    if (!editing && password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (editing && password && password.length < 8) { setError('Password must be at least 8 characters'); return; }

    setSaving(true);
    setError('');
    try {
      let user: CrmUser;
      if (editing) {
        const res = await apiClient.put(`/users/${editing.id}`, {
          name, email,
          role:     isSelf ? undefined : role,
          isActive: isSelf ? undefined : isActive,
        });
        user = res.data as CrmUser;
        if (password.length >= 8) {
          await apiClient.put(`/users/${editing.id}/password`, { newPassword: password });
        }
      } else {
        const res = await apiClient.post('/users', { name, email, password, role, isActive });
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
          <DialogTitle>{editing ? 'Edit User' : 'Add User'}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="um-name" required>Full Name</Label>
            <Input id="um-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya Singh" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="um-email" required>Email</Label>
            <Input id="um-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@gktravels.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="um-password">
              {editing ? 'New Password' : 'Password'}
              {editing && <span className="ml-1 text-[10px] text-gray-400 font-normal">(leave blank to keep current)</span>}
            </Label>
            <Input
              id="um-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={editing ? 'Leave blank to keep current' : 'Min. 8 characters'}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role{isSelf && <span className="ml-1 text-[10px] text-gray-400 font-normal">(cannot change your own role)</span>}</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(r => (
                <button
                  key={r}
                  type="button"
                  disabled={isSelf}
                  onClick={() => setRole(r)}
                  className={cn(
                    'py-2 rounded-xl text-xs font-semibold border transition-all',
                    role === r
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                    isSelf && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status{isSelf && <span className="ml-1 text-[10px] text-gray-400 font-normal">(cannot deactivate your own account)</span>}</Label>
            <div className="flex gap-2">
              {[true, false].map(val => (
                <button
                  key={String(val)}
                  type="button"
                  disabled={isSelf}
                  onClick={() => setIsActive(val)}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-xs font-semibold border transition-all',
                    isActive === val
                      ? val ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300',
                    isSelf && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {val ? 'Active' : 'Inactive'}
                </button>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={handleSave}>
            {editing ? 'Save Changes' : 'Add User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ──────────────────────────────────────────────

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users,    setUsers]    = useState<CrmUser[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editUser, setEditUser] = useState<CrmUser | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/users');
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err: unknown) {
      toast.error('Failed to load users', getApiErrorMessage(err, 'Failed to load users'));
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
    toast.success(editUser ? 'User updated' : 'User added', user.email);
  }

  async function handleToggleActive(u: CrmUser) {
    const ok = await confirm({
      title:        `${u.isActive ? 'Deactivate' : 'Activate'} ${u.name}?`,
      description:  u.isActive
        ? 'This user will no longer be able to log in.'
        : 'This user will be able to log in again.',
      confirmLabel: u.isActive ? 'Deactivate' : 'Activate',
      variant:      u.isActive ? 'destructive' : 'default',
    });
    if (!ok) return;
    try {
      const res = await apiClient.put(`/users/${u.id}`, { isActive: !u.isActive });
      setUsers(prev => prev.map(x => x.id === u.id ? res.data as CrmUser : x));
      toast.success(`User ${u.isActive ? 'deactivated' : 'activated'}`);
    } catch (err: unknown) {
      toast.error('Failed to update user', getApiErrorMessage(err, 'Failed to update user'));
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
    <div className="p-5 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Users</h2>
          <Badge variant="secondary">{users.length} total</Badge>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setEditUser(null); setFormOpen(true); }}>
          <Plus className="w-3.5 h-3.5" /> Add User
        </Button>
      </div>

      {users.length === 0 ? (
        <EmptyState icon={UsersRound} title="No users yet"
          action={{ label: '+ Add User', onClick: () => { setEditUser(null); setFormOpen(true); } }} />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Name', 'Email', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900 text-sm">{u.name}</div>
                          {isSelf && <div className="text-[10px] text-indigo-600 font-medium">You</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge className={ROLE_BADGE_CLASS[u.role]}>{u.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                        <span className={cn('w-2 h-2 rounded-full', u.isActive ? 'bg-emerald-500' : 'bg-red-400')} />
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatLastLogin(u.lastLoginAt)}</td>
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
                          title={isSelf ? 'You cannot deactivate your own account' : (u.isActive ? 'Deactivate' : 'Activate')}
                          disabled={isSelf}
                          onClick={() => handleToggleActive(u)}
                          className={isSelf ? 'opacity-40 cursor-not-allowed' : ''}
                        >
                          {u.isActive
                            ? <ShieldOff className="w-3.5 h-3.5 text-amber-500" />
                            : <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                          }
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <UserFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditUser(null); }}
        onSaved={handleSaved}
        editing={editUser}
        selfId={currentUser?.id}
      />
    </div>
  );
}
