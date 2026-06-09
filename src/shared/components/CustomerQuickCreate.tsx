import { useState } from 'react';
import { useStore } from '@/store';
import type { Customer } from '@/shared/types';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogBody,
} from '@/shared/components/ui/dialog';
import { toast } from '@/shared/hooks/useToast';

interface Props {
  open:      boolean;
  onClose:   () => void;
  onCreated: (customer: Customer) => void;
}

export function CustomerQuickCreate({ open, onClose, onCreated }: Props) {
  const createCustomer = useStore(s => s.createCustomer);
  const [name,  setName]  = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  function handleClose() {
    setName(''); setPhone(''); setEmail('');
    onClose();
  }

  function handleSave() {
    if (!name.trim())  { toast.error('Customer name is required'); return; }
    if (!phone.trim()) { toast.error('Phone number is required');  return; }
    const cust = createCustomer({
      name:        name.trim(),
      phone:       phone.trim(),
      email:       email.trim() || undefined,
      tripIds:     [],
      preferences: {},
    });
    toast.success('Customer created', cust.name);
    onCreated(cust);
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="qc-name" required>Name</Label>
              <Input
                id="qc-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Full name"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qc-phone" required>Phone</Label>
              <Input
                id="qc-phone"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qc-email">Email</Label>
              <Input
                id="qc-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@example.com"
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave}>
            Create Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
