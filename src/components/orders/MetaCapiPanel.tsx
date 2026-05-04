// MetaCapiPanel — admin-only debug/control panel for an order's Meta CAPI Purchase event.
// Shows: sent status, event_id, fbtrace_id from response, last attempt time.
// Buttons: "Retry Send" (force re-fire) and "Reverse Event" (negative-value correction).
//
// Only admins see this — surfaces the technical layer they need when troubleshooting
// dropped Meta events or refunds.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import {
  Activity, RefreshCw, Undo2, CheckCircle2, AlertTriangle, ExternalLink,
} from 'lucide-react';

interface Props {
  orderId: number;
  orderNumber: string;
}

const MetaCapiPanel: React.FC<Props> = ({ orderId, orderNumber }) => {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const [showRaw, setShowRaw] = useState(false);

  // ALL hooks must be called unconditionally — checks happen AFTER hook calls
  const isAdmin = role === 'ADMIN';

  const { data: order } = useQuery({
    queryKey: ['order-capi', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_number, status, amount_paid, order_amount, capi_purchase_sent, capi_purchase_sent_at, capi_purchase_event_id, capi_purchase_response, capi_purchase_reversed'
        )
        .eq('id', orderId)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!orderId && isAdmin,
    refetchInterval: 15000,
  });

  const retry = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-meta-purchase', {
        body: { order_id: orderId, force: true },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed');
      return data;
    },
    onSuccess: (data) => {
      showSuccess('Meta event re-sent', `event_id: ${data.event_id}`);
      queryClient.invalidateQueries({ queryKey: ['order'] });
      queryClient.invalidateQueries({ queryKey: ['order-capi', orderId] });
    },
    onError: (err: any) => showError('Send failed', err?.message || 'Try again'),
  });

  const reverse = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('reverse-meta-purchase', {
        body: { order_id: orderId, reason: order?.status ? `Order ${order.status.toLowerCase()}` : 'manual' },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed');
      return data;
    },
    onSuccess: () => {
      showSuccess('Meta event reversed', 'Negative-value Purchase sent for correction');
      queryClient.invalidateQueries({ queryKey: ['order'] });
      queryClient.invalidateQueries({ queryKey: ['order-capi', orderId] });
    },
    onError: (err: any) => showError('Reversal failed', err?.message || 'Try again'),
  });

  // EARLY RETURNS — only after all hooks are called
  if (!isAdmin) return null;
  if (!order) return null;
  if (!order.amount_paid || order.amount_paid <= 0) return null;

  const sent = order.capi_purchase_sent === true;
  const reversed = order.capi_purchase_reversed === true;
  const isCancelled = ['CANCELLED', 'REFUNDED'].includes(order.status);
  const needsReversal = sent && isCancelled && !reversed;
  const fbtraceId = order.capi_purchase_response?.fbtrace_id;

  const StatusBadge = () => {
    if (reversed) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/15 text-slate-400">
          <Undo2 className="w-3 h-3" /> Reversed
        </span>
      );
    }
    if (sent) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400">
          <CheckCircle2 className="w-3 h-3" /> Sent to Meta
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400">
        <AlertTriangle className="w-3 h-3" /> Not yet sent
      </span>
    );
  };

  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand-orange" />
          <h4 className="text-sm font-semibold text-white">Meta Conversions API</h4>
        </div>
        <StatusBadge />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-slate-500">Event ID</p>
          <p className="text-slate-300 font-mono truncate" title={order.capi_purchase_event_id || ''}>
            {order.capi_purchase_event_id || '—'}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Sent at</p>
          <p className="text-slate-300">
            {order.capi_purchase_sent_at
              ? new Date(order.capi_purchase_sent_at).toLocaleString()
              : '—'}
          </p>
        </div>
      </div>

      {fbtraceId && (
        <div className="text-xs">
          <p className="text-slate-500">fbtrace_id (give this to Meta support)</p>
          <p className="text-slate-300 font-mono break-all">{fbtraceId}</p>
        </div>
      )}

      {needsReversal && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-xs text-amber-300">
          ⚠️ Order is {order.status.toLowerCase()} but the Meta Purchase event was already sent.
          Click "Reverse Event" below to send a negative-value correction to Meta.
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-all border border-white/5"
        >
          <RefreshCw className={`w-3 h-3 ${retry.isPending ? 'animate-spin' : ''}`} />
          {retry.isPending ? 'Sending…' : sent ? 'Re-send to Meta' : 'Send to Meta'}
        </button>

        {sent && !reversed && (
          <button
            onClick={() => {
              if (window.confirm(
                'Send a negative-value correction to Meta? This is for cancelled/refunded orders only.'
              )) {
                reverse.mutate();
              }
            }}
            disabled={reverse.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 text-amber-400 hover:text-amber-300 rounded-lg text-xs font-medium transition-all border border-amber-500/30"
          >
            <Undo2 className={`w-3 h-3 ${reverse.isPending ? 'animate-spin' : ''}`} />
            {reverse.isPending ? 'Reversing…' : 'Reverse Event'}
          </button>
        )}

        {order.capi_purchase_response && (
          <button
            onClick={() => setShowRaw(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs font-medium transition-all border border-white/5"
          >
            {showRaw ? 'Hide' : 'Show'} Meta response
          </button>
        )}

        <a
          href="https://business.facebook.com/events_manager2/list/dataset"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-white text-xs transition-colors ml-auto"
        >
          <ExternalLink className="w-3 h-3" />
          Events Manager
        </a>
      </div>

      {showRaw && order.capi_purchase_response && (
        <pre className="text-[10px] text-slate-400 bg-slate-950/50 border border-white/5 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
          {JSON.stringify(order.capi_purchase_response, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default MetaCapiPanel;
