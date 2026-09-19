import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Field, Select } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { api, ApiError } from '@/lib/api';

interface DriverLogin { id: string; name: string; email: string; isActive: boolean; driverId: string | null; driverName: string | null }

/** Admin only: which Driver-role login opens this driver's duties on a phone. */
export function DriverLoginLink({ driverId, currentUserId }: { driverId: string; currentUserId: string | null }) {
  const qc = useQueryClient();
  const logins = useQuery({ queryKey: ['driver-logins'], queryFn: () => api.get<DriverLogin[]>('/v2/drivers/logins') });
  const [userId, setUserId] = useState(currentUserId ?? '');
  const save = useMutation({
    mutationFn: () => api.put<DriverLogin[]>(`/v2/drivers/${driverId}/login`, { userId: userId || null }),
    onSuccess: () => { toast.success(userId ? 'Login linked' : 'Login removed'); void qc.invalidateQueries({ queryKey: ['driver-logins'] }); void qc.invalidateQueries({ queryKey: ['masters'] }); },
    onError: e => toast.error('Not saved', (e as ApiError).message),
  });
  const options = (logins.data ?? []).filter(l => !l.driverId || l.driverId === driverId);
  return (
    <div className="mt-6 pt-4 border-t border-slate-200 space-y-2">
      <Field label="Driver app login" htmlFor="dr-login" hint="Create a user with the Driver role in User management, then pick it here. The driver then sees only their confirmed duties.">
        <Select id="dr-login" value={userId} onChange={e => setUserId(e.target.value)}>
          <option value="">No app login</option>
          {options.map(l => <option key={l.id} value={l.id}>{l.name} · {l.email}{l.isActive ? '' : ' (inactive)'}</option>)}
        </Select>
      </Field>
      <Button size="sm" variant="outline" disabled={(userId || null) === currentUserId} loading={save.isPending} onClick={() => save.mutate()}>Save login</Button>
    </div>
  );
}
