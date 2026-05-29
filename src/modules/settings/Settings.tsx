import { Settings as SettingsIcon, Database, Trash2 } from 'lucide-react';
import { useStore } from '@/store';
import { Button } from '@/shared/components/ui/button';
import { confirm } from '@/shared/hooks/useConfirm';
import { toast } from '@/shared/hooks/useToast';

export default function Settings() {
  const clearAll = useStore(s => s.clearAll);
  const trips    = useStore(s => s.trips);
  const leads    = useStore(s => s.leads);
  const customers = useStore(s => s.customers);

  async function handleClearAll() {
    const ok = await confirm({
      title:        'Reset all data?',
      description:  'This will permanently delete ALL trips, leads, customers, payments, and bookings. This cannot be undone.',
      confirmLabel: 'Reset Everything',
      variant:      'destructive',
    });
    if (ok) {
      clearAll();
      toast.success('All data cleared');
    }
  }

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold text-gray-900 font-display">Settings</h2>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3.5">
        <p className="text-sm text-blue-700 font-medium">Full Settings Module — Phase 4</p>
        <p className="text-xs text-blue-600 mt-1">
          Company profile, GST settings, invoice templates, user management, WhatsApp/email integrations,
          and automation rules are coming in Phase 4.
        </p>
      </div>

      {/* Data stats */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-600" /> Data Summary
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Trips',     count: trips.length    },
            { label: 'Leads',     count: leads.length    },
            { label: 'Customers', count: customers.length },
          ].map(item => (
            <div key={item.label} className="text-center p-4 bg-gray-50 rounded-xl">
              <div className="text-2xl font-bold text-gray-900 font-display">{item.count}</div>
              <div className="text-xs text-gray-500 mt-1">{item.label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">
          Data is stored in your browser's localStorage. Migrate to a database in Phase 2.
        </p>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-xl border border-red-200 p-5">
        <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Danger Zone
        </h3>
        <p className="text-xs text-gray-600 mb-4">
          Permanently delete all data from this CRM. This action cannot be undone.
        </p>
        <Button variant="destructive" size="sm" onClick={handleClearAll} className="gap-2">
          <Trash2 className="w-3.5 h-3.5" /> Reset All Data
        </Button>
      </div>
    </div>
  );
}
