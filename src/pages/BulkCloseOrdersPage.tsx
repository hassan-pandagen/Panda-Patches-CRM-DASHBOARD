// Bulk Close Orders — admin tool to clear the backlog of orders stuck in a non-terminal status.
// Filter by status + age, multi-select, and set them all to DELIVERED with a delivery date.
// The "estimated" toggle records delivered_at_estimated so the website can still compute a real
// median delivery time from observed dates only. Backed by the admin-only bulk_close_orders RPC.
// Age uses created_at (updated_at is unreliable after the 2026-08 backing backfill).

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { useToast } from '../hooks/useToast';
import Spinner from '../components/ui/Spinner';
import { CheckCircle2, PackageCheck, AlertTriangle } from 'lucide-react';

const STALE_STATUSES = ['SHIPPED', 'IN_PRODUCTION', 'NEW_ORDER', 'AWAITING_CUSTOMER_APPROVAL', 'APPROVED', 'REMAKE'];
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const ageDays = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

// review-invite-cron emails a Trustpilot request for any DELIVERED order whose delivered_at is
// 2–5 days old. Closing a big backlog with a RECENT date would drop every one of those orders into
// that window and blast review requests for orders actually delivered months ago. Default the date
// well outside the window, and warn if the user picks a recent one.
const REVIEW_WINDOW_DAYS = 6;
const DEFAULT_CLOSE_DATE_DAYS_AGO = 30;

const BulkCloseOrdersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();

  const [statuses, setStatuses] = useState<string[]>(['SHIPPED', 'IN_PRODUCTION']);
  const [minAgeDays, setMinAgeDays] = useState<number>(30);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deliveredDate, setDeliveredDate] = useState<string>(daysAgoStr(DEFAULT_CLOSE_DATE_DAYS_AGO));
  const [estimated, setEstimated] = useState<boolean>(true);

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['bulk-close-candidates', statuses.join(','), minAgeDays],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - minAgeDays * 86400000).toISOString();
      let q = supabase
        .from('orders')
        .select('id, order_number, customer_name, organization, status, created_at')
        .is('deleted_at', null)
        .lt('created_at', cutoff)
        .order('created_at', { ascending: true })
        .limit(2000);
      if (statuses.length) q = q.in('status', statuses);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const allSelected = orders.length > 0 && selected.size === orders.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(orders.map((o: any) => o.id)));
  const toggle = (id: number) =>
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const statusToggle = (s: string) =>
    setStatuses(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]));

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (selected.size === 0) throw new Error('Select at least one order');
      const { data, error } = await supabase.rpc('bulk_close_orders', {
        p_order_ids: [...selected],
        p_delivered_at: deliveredDate,
        p_estimated: estimated,
      });
      if (error) throw error;
      return data as { closed: number };
    },
    onSuccess: (res) => {
      showSuccess('Orders closed', `${res?.closed ?? 0} order(s) set to Delivered${estimated ? ' (estimated date)' : ''}.`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      refetch();
    },
    onError: (e: any) => showError('Bulk close failed', e?.message || 'Try again'),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fadeIn">
      <div className="flex items-center gap-3 mb-1">
        <PackageCheck className="w-6 h-6 text-emerald-400" />
        <h1 className="text-2xl font-bold text-white">Bulk Close Orders</h1>
      </div>
      <p className="text-sm text-slate-400 mb-6 max-w-3xl">
        Clear orders stuck in a non-terminal status. Sets the selected orders to <strong className="text-white">Delivered</strong> with
        a delivery date. Leave <strong className="text-white">Date is estimated</strong> checked unless you know the exact date —
        the public delivery-time stat is computed only from <em>observed</em> (non-estimated) dates.
      </p>

      {/* Filters */}
      <div className="bg-slate-900/40 border border-white/10 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Statuses</label>
          <div className="flex flex-wrap gap-1.5">
            {STALE_STATUSES.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => statusToggle(s)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  statuses.includes(s)
                    ? 'bg-brand-orange/15 text-brand-orange border-brand-orange/40'
                    : 'bg-slate-800 text-slate-400 border-white/10 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Older than (days)</label>
          <input
            type="number"
            min={0}
            value={minAgeDays}
            onChange={e => setMinAgeDays(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-28 px-3 py-1.5 bg-slate-800 border border-white/10 rounded text-sm text-white focus:outline-none focus:border-brand-orange/50"
          />
        </div>
        <div className="text-sm text-slate-400 ml-auto">
          {orders.length} matching · <span className="text-white">{selected.size}</span> selected
        </div>
      </div>

      {/* Close bar */}
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Delivery date</label>
          <input
            type="date"
            max={todayStr()}
            value={deliveredDate}
            onChange={e => setDeliveredDate(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-white/10 rounded text-sm text-white focus:outline-none focus:border-brand-orange/50"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300 pb-1.5">
          <input
            type="checkbox"
            checked={estimated}
            onChange={e => setEstimated(e.target.checked)}
            className="rounded border-slate-600 bg-slate-800 text-brand-orange focus:ring-brand-orange"
          />
          Date is estimated (not observed)
        </label>
        <button
          onClick={() => closeMutation.mutate()}
          disabled={selected.size === 0 || closeMutation.isPending}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
        >
          <CheckCircle2 className="w-4 h-4" />
          {closeMutation.isPending ? 'Closing…' : `Close ${selected.size || ''} as Delivered`}
        </button>

        {/* A recent delivery date drops these orders into the review-invite window (2–5 days after
            delivery) and would email every customer a Trustpilot request for a months-old order. */}
        {ageDays(deliveredDate) < REVIEW_WINDOW_DAYS && (
          <div className="w-full flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>This date will send review-request emails.</strong> Orders delivered 2–5 days ago
              automatically get a Trustpilot invite — closing {selected.size || 'these'} order
              {selected.size === 1 ? '' : 's'} with a recent date would email every one of those customers
              about an order actually delivered long ago. Pick a date at least {REVIEW_WINDOW_DAYS} days back.
            </span>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="bg-slate-900/40 border border-white/10 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3 w-10">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="rounded border-slate-600 bg-slate-800 text-brand-orange focus:ring-brand-orange" />
                  </th>
                  <th className="p-3 text-left">Order</th>
                  <th className="p-3 text-left">Customer</th>
                  <th className="p-3 text-left">Company / End Client</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-right">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {orders.map((o: any) => (
                  <tr key={o.id} className={`hover:bg-white/5 ${selected.has(o.id) ? 'bg-brand-orange/5' : ''}`}>
                    <td className="p-3">
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)}
                        className="rounded border-slate-600 bg-slate-800 text-brand-orange focus:ring-brand-orange" />
                    </td>
                    <td className="p-3 font-medium text-brand-orange">{o.order_number}</td>
                    <td className="p-3 text-white">{o.customer_name}</td>
                    <td className="p-3 text-slate-300">{o.organization || <span className="text-slate-600">—</span>}</td>
                    <td className="p-3">
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/10">{o.status}</span>
                    </td>
                    <td className={`p-3 text-right ${ageDays(o.created_at) >= 45 ? 'text-amber-400' : 'text-slate-400'}`}>
                      {ageDays(o.created_at)}d
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">No orders match these filters — backlog clear. 🎉</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkCloseOrdersPage;
