// src/components/orders/EmailLogsSection.tsx
// Shows all emails sent/failed for an order, with resend capability for failed ones.

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { resendFailedEmail } from '../../services/orderService';
import { queryKeys } from '../../constants/queryKeys';
import { Order } from '../../types';
import { useToast } from '../../hooks/useToast';
import SpotlightCard from '../ui/SpotlightCard';
import { CheckCircle, XCircle, RefreshCw, Mail, AlertTriangle, Lightbulb } from 'lucide-react';
import { format, parseISO } from 'date-fns';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const parseEmailError = (errorMsg: string): { reason: string; solution: string } => {
  const lower = (errorMsg || '').toLowerCase();
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('api key')) {
    return { reason: 'API key expired or invalid', solution: 'Ask admin to check the SendGrid/SES API key in Supabase Edge Function secrets.' };
  }
  if (lower.includes('404') || lower.includes('not found') || lower.includes('template')) {
    return { reason: 'Email template not found', solution: 'Verify the template name exists in your email service dashboard.' };
  }
  if (lower.includes('400') || lower.includes('invalid') || lower.includes('bad request')) {
    return { reason: 'Invalid email address or request data', solution: "Check the customer's email address is correct, then resend." };
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many')) {
    return { reason: 'Rate limit exceeded', solution: 'Wait 1–2 minutes and try resending.' };
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
    return { reason: 'Network or connection error', solution: 'Check your internet connection, then try resending.' };
  }
  if (lower.includes('function') || lower.includes('edge') || lower.includes('invoke')) {
    return { reason: 'Supabase Edge Function error', solution: 'Check the Supabase Edge Function logs for more details.' };
  }
  return { reason: 'Unknown email error', solution: 'Try resending. If it fails again, check Supabase Edge Function logs.' };
};

const formatTemplateName = (templateId: string): string =>
  templateId
    .replace(/^(CUSTOMER_|INTERNAL_)/, match => match === 'CUSTOMER_' ? '→ Customer: ' : '→ Internal: ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

// ─── COMPONENT ────────────────────────────────────────────────────────────────

interface EmailLogsSectionProps {
  order: Order;
}

const EmailLogsSection: React.FC<EmailLogsSectionProps> = ({ order }) => {
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();
  const [resendingId, setResendingId] = React.useState<number | null>(null);

  const { data: communications = [], isLoading } = useQuery({
    queryKey: queryKeys.communications.byOrderId(order.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_communications')
        .select('*')
        .eq('order_id', order.id)
        .order('sent_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 30,
  });

  const failed = communications.filter((c: any) => c.subject?.startsWith('FAILED:'));
  const sent = communications.filter((c: any) => !c.subject?.startsWith('FAILED:'));

  const handleResend = async (comm: any) => {
    // Extract trigger status from subject: "FAILED: NEW_ORDER" → "NEW_ORDER"
    const triggerStatus = comm.subject?.replace('FAILED: ', '') || '';
    setResendingId(comm.id);
    try {
      await resendFailedEmail(order, comm.id, triggerStatus, comm.template_id, comm.recipient_email);
      showSuccess('Email resent successfully!');
      queryClient.invalidateQueries({ queryKey: queryKeys.communications.byOrderId(order.id) });
    } catch (err: any) {
      showError(`Resend failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setResendingId(null);
    }
  };

  const handleSendMissedNewOrder = async () => {
    setResendingId(-1);
    try {
      const { triggerStatusEmail } = await import('../../services/orderService');
      await triggerStatusEmail(order, 'NEW_ORDER');
      showSuccess('Order confirmation email sent!');
      queryClient.invalidateQueries({ queryKey: queryKeys.communications.byOrderId(order.id) });
    } catch (err: any) {
      showError(`Send failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setResendingId(null);
    }
  };

  if (isLoading) return null;

  // No logs yet — show a send button in case email was missed (e.g. order created without email)
  if (communications.length === 0) {
    return (
      <SpotlightCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-brand-orange" />
          <h3 className="text-lg font-semibold text-white">Email Communications</h3>
        </div>
        <p className="text-sm text-slate-400 mb-4">No emails sent yet for this order.</p>
        <button
          onClick={handleSendMissedNewOrder}
          disabled={resendingId === -1}
          className="flex items-center gap-2 px-4 py-2 bg-brand-orange/10 border border-brand-orange/30 text-brand-orange rounded-lg text-sm font-medium hover:bg-brand-orange/20 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${resendingId === -1 ? 'animate-spin' : ''}`} />
          {resendingId === -1 ? 'Sending…' : 'Send NEW_ORDER Confirmation Email'}
        </button>
      </SpotlightCard>
    );
  }

  return (
    <SpotlightCard className="p-6">
      <div className="flex items-center gap-2 mb-5">
        <Mail className="w-5 h-5 text-brand-orange" />
        <h3 className="text-lg font-semibold text-white">Email Communications</h3>
        <span className="ml-auto text-xs text-slate-500">{sent.length} sent · {failed.length} failed</span>
      </div>

      {/* ── FAILED EMAILS ───────────────────────────────────────────── */}
      {failed.length > 0 && (
        <div className="mb-5 space-y-3">
          <p className="text-xs font-bold uppercase text-red-400 tracking-wider flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Failed Emails ({failed.length})
          </p>
          {failed.map((comm: any) => {
            const { reason, solution } = parseEmailError(comm.body || '');
            const isResending = resendingId === comm.id;
            const time = comm.sent_at
              ? format(parseISO(comm.sent_at), 'MMM d, h:mm a')
              : '—';

            return (
              <div
                key={comm.id}
                className="bg-red-950/30 border border-red-500/20 rounded-xl p-4 space-y-3"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-300 truncate">
                      {formatTemplateName(comm.template_id || comm.subject?.replace('FAILED: ', '') || 'Unknown')}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      To: {comm.recipient_email} · {time}
                    </p>
                  </div>
                  <button
                    onClick={() => handleResend(comm)}
                    disabled={isResending}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-orange hover:bg-orange-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-lg transition-colors flex-shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
                    {isResending ? 'Sending…' : 'Resend'}
                  </button>
                </div>

                {/* Error reason */}
                <div className="flex items-start gap-2 bg-red-900/20 rounded-lg p-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-300">{reason}</p>
                    {comm.body && (
                      <p className="text-xs text-slate-500 mt-0.5 font-mono break-all leading-relaxed">
                        {comm.body.length > 120 ? comm.body.slice(0, 120) + '…' : comm.body}
                      </p>
                    )}
                  </div>
                </div>

                {/* Solution hint */}
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-300/80">{solution}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SENT EMAILS ─────────────────────────────────────────────── */}
      {sent.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase text-green-400 tracking-wider flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" /> Sent ({sent.length})
          </p>
          <div className="space-y-1.5">
            {sent.map((comm: any) => {
              const time = comm.sent_at
                ? format(parseISO(comm.sent_at), 'MMM d, h:mm a')
                : '—';
              return (
                <div
                  key={comm.id}
                  className="flex items-center justify-between py-2 px-3 bg-slate-800/40 rounded-lg border border-slate-700/30"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-300 truncate">
                        {formatTemplateName(comm.template_id || '')}
                      </p>
                      <p className="text-xs text-slate-500 truncate">To: {comm.recipient_email}</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0 ml-3">{time}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </SpotlightCard>
  );
};

export default EmailLogsSection;
