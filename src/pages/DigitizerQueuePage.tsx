// src/pages/DigitizerQueuePage.tsx
// Task 1.5 — the digitizer's whole view of the system: a queue and an item detail.
//
// A NEW ROUTE WITH ITS OWN QUERY, as the brief requires — never the order page with
// fields hidden. It never touches `orders` or `quotes`; it calls get_digitizer_queue /
// get_digitizer_item, which are the only tables-facing thing a digitizer is allowed to
// reach. If this file tried to render a customer's name there would be nothing to render:
// the payload does not contain one.
//
// Read-only while the item sits with the customer (AWAITING_CUSTOMER_APPROVAL /
// MOCKUP_SENT): visible so the digitizer can see it is pending, but no uploads, so a
// correction cannot cross with a customer response in flight. There is no Send button
// anywhere here — the supervisor sends (Task 1.6), which is what removes the digitizer's
// last route to customer contact.

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PenTool, Clock, AlertTriangle, ArrowLeft } from 'lucide-react';
import SpotlightCard from '../components/ui/SpotlightCard';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import FileUploadSection from '../components/orders/FileUpload';
import Button from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { roleCan, ROLES_CAN_USE_DIGITIZER_PORTAL } from '../utils/roleAccess';
import { getDigitizerQueue, getDigitizerItem } from '../services/digitizerService';

const STATE_LABELS: Record<string, string> = {
  DIGITIZING: 'To do',
  REVISION_REQUESTED: 'Changes requested',
  AWAITING_CUSTOMER_APPROVAL: 'With the customer',
  MOCKUP_ASSIGNED: 'To do',
  MOCKUP_SENT: 'With the customer',
};

const DigitizerQueuePage: React.FC = () => {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = React.useState<number | null>(null);

  const allowed = roleCan(roles, ROLES_CAN_USE_DIGITIZER_PORTAL);

  const { data: queue, isLoading } = useQuery({
    queryKey: ['digitizer-queue'],
    queryFn: getDigitizerQueue,
    enabled: allowed,
    // Short, because revocation is meant to land on the next fetch rather than the next
    // login. A released item disappears within the minute.
    staleTime: 1000 * 30,
    refetchOnWindowFocus: true,
  });

  const { data: item, isLoading: itemLoading } = useQuery({
    queryKey: ['digitizer-item', openId],
    queryFn: () => getDigitizerItem(openId!),
    enabled: allowed && openId !== null,
    staleTime: 1000 * 30,
  });

  if (!allowed) {
    return (
      <div className="p-8">
        <EmptyState title="Not available" description="This area is for digitizers." />
      </div>
    );
  }

  // ── Detail ────────────────────────────────────────────────────────────────
  if (openId !== null) {
    if (itemLoading) return <div className="p-8 space-y-4"><Skeleton width="100%" height={200} /></div>;

    // Gone from the window while it was open — the honest answer is that it moved on.
    if (!item) {
      return (
        <div className="p-8">
          <button onClick={() => setOpenId(null)} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to queue
          </button>
          <EmptyState
            title="This item has moved on"
            description="It is no longer assigned to you, or it has left the digitizing stage. Your files and history are kept on it."
          />
        </div>
      );
    }

    const readOnly = item.read_only;
    return (
      <div className="p-4 md:p-8 space-y-6 max-w-4xl">
        <button onClick={() => setOpenId(null)} className="flex items-center gap-2 text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back to queue
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white font-mono">{item.reference}</h1>
          {item.is_urgent && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">URGENT</span>
          )}
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
            {STATE_LABELS[item.state] ?? item.state}
          </span>
        </div>

        {readOnly && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200">
              This is with the customer. You can see it, but uploads are closed until they
              reply — otherwise a new file could cross with their answer. If something needs
              changing now, tell your supervisor.
            </p>
          </div>
        )}

        <SpotlightCard className="p-6">
          <h2 className="text-sm uppercase tracking-wider text-slate-400 font-bold mb-4">Specification</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {([
              ['Design', item.design_name], ['Type', item.patches_type], ['Size', item.design_size],
              ['Quantity', item.patches_quantity], ['Backing', item.design_backing], ['Border', item.border_type],
            ] as const).map(([label, value]) => value ? (
              <div key={label}>
                <div className="text-xs text-slate-400">{label}</div>
                <div className="text-white font-medium mt-0.5">{value}</div>
              </div>
            ) : null)}
          </div>
          {item.instructions && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="text-xs text-slate-400">Instructions</div>
              <p className="text-white text-sm mt-1 whitespace-pre-wrap">{item.instructions}</p>
            </div>
          )}
          {item.due_at && (
            <p className="text-xs text-slate-400 mt-4">Due {new Date(item.due_at).toLocaleDateString()}</p>
          )}
        </SpotlightCard>

        {item.change_request && (
          <SpotlightCard className="p-6 border-l-4 border-amber-500">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm uppercase tracking-wider text-amber-300 font-bold">Change requested</h2>
            </div>
            <p className="text-white text-sm whitespace-pre-wrap">{item.change_request}</p>
          </SpotlightCard>
        )}

        {!!item.customer_reference_urls?.length && (
          <SpotlightCard className="p-6">
            <h2 className="text-sm uppercase tracking-wider text-slate-400 font-bold mb-4">Reference files</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {item.customer_reference_urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer"
                   className="block rounded-lg overflow-hidden border border-white/10 hover:border-brand-orange transition-colors">
                  {/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)
                    ? <img src={url} alt="" className="w-full h-28 object-cover" />
                    : <div className="h-28 flex items-center justify-center text-xs text-slate-300 p-2 text-center break-all">
                        {decodeURIComponent(url.split('/').pop() || 'file').slice(0, 40)}
                      </div>}
                </a>
              ))}
            </div>
          </SpotlightCard>
        )}

        <SpotlightCard className="p-6">
          <h2 className="text-sm uppercase tracking-wider text-slate-400 font-bold mb-2">Your files</h2>
          <p className="text-xs text-slate-400 mb-4">
            Upload the mockup and the machine files here. Your supervisor sends the mockup to
            the customer — there is no send button on this page, by design.
          </p>
          {readOnly ? (
            <p className="text-sm text-slate-400 italic">Uploads are closed while this is with the customer.</p>
          ) : (
            <FileUploadSection
              title=""
              bucketName="production-files"
              folderPath={item.storage_prefix}
              urls={item.production_file_urls ?? []}
              onUrlsChange={() => queryClient.invalidateQueries({ queryKey: ['digitizer-item', openId] })}
            />
          )}
        </SpotlightCard>
      </div>
    );
  }

  // ── Queue ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <PenTool className="w-6 h-6 text-violet-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">My Queue</h1>
          <p className="text-sm text-slate-400">Urgent first, then by due date.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} width="100%" height={72} className="rounded-xl" />)}</div>
      ) : !queue?.length ? (
        <EmptyState
          title="Nothing assigned right now"
          description="When a supervisor assigns you a job it appears here."
        />
      ) : (
        <div className="space-y-3">
          {queue.map(row => (
            <button
              key={row.assignment_id}
              onClick={() => setOpenId(row.assignment_id)}
              className="w-full text-left bg-slate-900/40 border border-white/10 rounded-xl p-4 hover:border-violet-500/50 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-mono font-bold text-white">{row.reference}</span>
                {row.is_urgent && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">URGENT</span>
                )}
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                  {STATE_LABELS[row.state] ?? row.state}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                {row.design_name && <span>{row.design_name}</span>}
                {row.patches_type && <><span className="w-1 h-1 rounded-full bg-slate-600" /><span>{row.patches_type}</span></>}
                {row.design_size && <><span className="w-1 h-1 rounded-full bg-slate-600" /><span>{row.design_size}</span></>}
                {row.patches_quantity ? <><span className="w-1 h-1 rounded-full bg-slate-600" /><span>{row.patches_quantity} pcs</span></> : null}
                {row.due_at && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-slate-600" />
                    <span className={new Date(row.due_at) < new Date() ? 'text-red-400 font-medium' : ''}>
                      due {new Date(row.due_at).toLocaleDateString()}
                    </span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default DigitizerQueuePage;
