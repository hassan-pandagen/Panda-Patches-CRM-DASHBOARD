// src/components/orders/DisputesSection.tsx
// Minimal dispute entry on the order page.
//
// "A dispute you can't enter is a dispute that won't be tracked, and it must suppress
// review invites the day it's opened" — CEO, 7 Sept. That second half is the reason this
// is worth building at all: order status cannot see a dispute (a disputed order still sits
// at DELIVERED), so without a row here the review cron will cheerfully ask a customer
// mid-chargeback how the patches came out.
//
// Admin-only to write, supervisors can read — it is financial information, so production
// and digitizers never see it (§5.1).

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, Plus } from 'lucide-react';
import Button from '../ui/Button';
import SpotlightCard from '../ui/SpotlightCard';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import { roleCan, ROLES_CAN_MANAGE_USERS, ROLES_CAN_CONFIRM_COLOUR_MATCH } from '../../utils/roleAccess';

interface Dispute {
  id: number;
  source: string;
  external_id: string | null;
  amount: number | null;
  status: 'open' | 'won' | 'lost';
  reason: string | null;
  opened_at: string;
  closed_at: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  won:  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  lost: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const DisputesSection: React.FC<{ orderId: number }> = ({ orderId }) => {
  const { roles } = useAuth();
  const { success, error: showError } = useToast();
  const queryClient = useQueryClient();

  // Read: admin or supervisor. Write: admin only — mirrors the RLS policies, which are
  // the actual boundary; this only decides what is rendered.
  const canRead  = roleCan(roles, ROLES_CAN_CONFIRM_COLOUR_MATCH);   // admin + supervisor
  const canWrite = roleCan(roles, ROLES_CAN_MANAGE_USERS);           // admin

  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ source: 'square', external_id: '', amount: '', reason: '' });

  const { data: disputes } = useQuery({
    queryKey: ['order-disputes', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_disputes').select('*').eq('order_id', orderId).order('opened_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Dispute[];
    },
    enabled: canRead && !!orderId,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('order_disputes').insert({
        order_id: orderId,
        source: form.source,
        external_id: form.external_id.trim() || null,
        amount: form.amount ? Number(form.amount) : null,
        reason: form.reason.trim() || null,
        status: 'open',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-disputes', orderId] });
      success('Dispute logged', 'Review requests for this order are suppressed from now.');
      setAdding(false);
      setForm({ source: 'square', external_id: '', amount: '', reason: '' });
    },
    onError: (e: any) => showError('Could not log dispute', e?.message || 'Try again.'),
  });

  const settleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: 'won' | 'lost' }) => {
      // closed_at is required by a CHECK once status leaves 'open' — otherwise "won" and
      // "lost" become indistinguishable from a stale row nobody closed.
      const { error } = await supabase.from('order_disputes')
        .update({ status, closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['order-disputes', orderId] });
      success(`Marked ${v.status}`, v.status === 'lost'
        ? 'Review requests stay suppressed — the customer won the dispute.'
        : 'Review requests resume for this order.');
    },
    onError: (e: any) => showError('Could not update', e?.message || 'Try again.'),
  });

  if (!canRead) return null;
  if (!disputes?.length && !canWrite) return null;

  return (
    <SpotlightCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-bold text-white">Disputes</h3>
        </div>
        {canWrite && !adding && (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4 mr-1" /> Log dispute
          </Button>
        )}
      </div>

      {!disputes?.length && !adding && (
        <p className="text-sm text-slate-400">No disputes on this order.</p>
      )}

      {!!disputes?.length && (
        <div className="space-y-3 mb-4">
          {disputes.map(d => (
            <div key={d.id} className="p-3 rounded-lg bg-slate-800/60 border border-white/10">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${STATUS_STYLE[d.status]}`}>
                  {d.status.toUpperCase()}
                </span>
                <span className="text-sm text-white capitalize">{d.source}</span>
                {d.amount != null && <span className="text-sm text-slate-300">${Number(d.amount).toFixed(2)}</span>}
                {d.external_id && <span className="text-xs font-mono text-slate-400">{d.external_id}</span>}
              </div>
              {d.reason && <p className="text-sm text-slate-300 mt-1.5">{d.reason}</p>}
              <p className="text-xs text-slate-400 mt-1.5">
                Opened {new Date(d.opened_at).toLocaleDateString()}
                {d.closed_at && ` · closed ${new Date(d.closed_at).toLocaleDateString()}`}
              </p>
              {canWrite && d.status === 'open' && (
                <div className="flex gap-2 mt-3">
                  <Button variant="secondary" size="sm"
                          disabled={settleMutation.isPending}
                          onClick={() => settleMutation.mutate({ id: d.id, status: 'won' })}>
                    We won
                  </Button>
                  <Button variant="secondary" size="sm"
                          disabled={settleMutation.isPending}
                          onClick={() => settleMutation.mutate({ id: d.id, status: 'lost' })}>
                    We lost
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="space-y-3 pt-3 border-t border-white/10">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-1.5">Source</label>
              <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                <option value="square">Square</option>
                <option value="paypal">PayPal</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-1.5">Amount</label>
              <input type="number" step="0.01" value={form.amount}
                     onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                     className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-1.5">
              Case ID <span className="font-normal normal-case text-slate-500">— from Square/PayPal, optional</span>
            </label>
            <input type="text" value={form.external_id}
                   onChange={e => setForm(f => ({ ...f, external_id: e.target.value }))}
                   className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-1.5">Reason</label>
            <input type="text" value={form.reason} placeholder="e.g. unauthorised, item not received"
                   onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                   className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" disabled={addMutation.isPending} onClick={() => addMutation.mutate()}>
              Log dispute
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
          <p className="text-xs text-slate-400">
            Logging this stops review requests for the order immediately — order status
            can&apos;t show a dispute, so this row is the only thing that tells the review
            job to stand down.
          </p>
        </div>
      )}
    </SpotlightCard>
  );
};

export default DisputesSection;
