import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { EmptyState, PageHeader } from '@/design-system';
import type { ApiError } from '@/lib/api';
import { commsApi } from '../api';

function Row({ title, configured, provider, hint, what }: { title: string; configured: boolean; provider: string; hint: string | null; what: string }) {
  return (
    <li className="flex items-start gap-3 p-4">
      {configured ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <XCircle className="w-5 h-5 text-slate-400 shrink-0" />}
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{title} <span className="text-sm font-normal text-slate-500">· {configured ? provider : 'Not configured'}</span></p>
        <p className="text-sm text-slate-600 mt-0.5">{what}</p>
        {hint && <p className="text-xs text-slate-500 mt-1 break-words">{hint}</p>}
      </div>
    </li>
  );
}

/** Which channels can really send today — no pretending on either side. */
export default function MessagingStatusPage() {
  const q = useQuery({ queryKey: ['comms', 'status'], queryFn: commsApi.status });
  const webhookUrl = `${window.location.origin}/api/webhooks/whatsapp`;
  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Messaging" subtitle="How WhatsApp and email leave TravelOS, and what is still switched off" />
      <div className="px-5 py-4 space-y-4 max-w-3xl">
        {q.isPending && <p className="text-sm text-slate-500">Loading…</p>}
        {q.isError && <EmptyState title="Could not read the status" description={(q.error as ApiError).message} />}
        {q.data && (
          <>
            <ul className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">
              <Row title="WhatsApp" {...q.data.whatsapp}
                what="Sent only through the official Meta WhatsApp Cloud API, and only with a template Meta has approved. Until then, messages can still be opened in your own WhatsApp." />
              <Row title="Delivery ticks" configured={q.data.webhook.configured} provider="Meta webhook" hint={q.data.webhook.hint}
                what={`Delivered, read and failed updates from Meta. The address to give Meta: ${webhookUrl}`} />
              <Row title="Email" {...q.data.email} what="Sent from the agency's own mailbox over SMTP, as plain text." />
            </ul>
            <p className="text-xs text-slate-500">Keys are set on the server, never in TravelOS, and are never shown here. <Link to="/settings/templates" className="text-sky-700 hover:underline">Message templates</Link></p>
          </>
        )}
      </div>
    </div>
  );
}
